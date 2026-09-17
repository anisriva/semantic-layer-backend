import { Request, Response, NextFunction } from 'express';
import { JobQueueService } from '@/services/job-queue.js';

export class JobController {
  constructor(private readonly jobQueueService: JobQueueService = new JobQueueService()) {}

  /**
   * GET /api/v1/jobs/:id
   * Gets a specific job.
   */
  async getJob(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      if (!id) {
        res.status(400).json({ error: 'Job ID is required' });
        return;
      }
      const jobId: string = Array.isArray(id) ? (id[0] ?? '') : id;
      const job = await this.jobQueueService.getJob(jobId);

      if (!job) {
        res.status(404).json({
          error: 'Job not found',
        });
        return;
      }

      res.json(job);
    } catch (error) {
      next(error);
    }
  }



  /**
   * GET /api/v1/repositories/:id/jobs
   * Lists jobs for a repository.
   */
  async listRepositoryJobs(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      if (!id) {
        res.status(400).json({ error: 'Repository ID is required' });
        return;
      }
      const repositoryId: string = Array.isArray(id) ? (id[0] ?? '') : id;
      const { status, type, limit, offset } = req.query;

      const jobs = await this.jobQueueService.listJobs(repositoryId, {
        status: status as 'pending' | 'processing' | 'completed' | 'failed' | undefined,
        type: type as 'INDEX' | 'REFRESH' | undefined,
        limit: limit ? parseInt(String(limit)) : undefined,
        offset: offset ? parseInt(String(offset)) : undefined,
      });

      res.json(jobs);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/jobs/:id/logs (SSE)
   *
   * Streams raw console-output log lines captured while the job is/was
   * processing (`src/helpers/job-log-capture.ts`), for tailing an
   * in-progress job in a UI. Complements `GET /api/v1/jobs/:id/audit`,
   * which is the right endpoint once a job has completed (structured,
   * step-level metrics rather than free-form lines).
   *
   * Behavior:
   * 1. Replays every log line recorded so far as `event: log` frames.
   * 2. If the job is already in a terminal state (`completed`/`failed`),
   *    sends `event: done` and closes immediately.
   * 3. Otherwise polls for new lines and job-status changes at
   *    `app.worker.logStreamPollIntervalMs`, streaming new `event: log`
   *    frames as they appear, until the job reaches a terminal state
   *    (then sends `event: done` and closes) or the client disconnects.
   */
  async streamJobLogs(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id: rawId } = req.params;
      if (!rawId) {
        res.status(400).json({ error: 'Job ID is required' });
        return;
      }
      const jobId: string = Array.isArray(rawId) ? (rawId[0] ?? '') : rawId;

      const job = await this.jobQueueService.getJob(jobId);
      if (!job) {
        res.status(404).json({ error: 'Job not found' });
        return;
      }

      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });

      let lastLogId: string | undefined;
      const sendLogs = async (): Promise<void> => {
        const logs = await this.jobQueueService.getJobLogs(jobId, lastLogId);
        for (const log of logs) {
          res.write(`event: log\ndata: ${JSON.stringify(log)}\n\n`);
          lastLogId = log.id;
        }
      };

      const sendDone = (status: string): void => {
        res.write(`event: done\ndata: ${JSON.stringify({ status })}\n\n`);
        res.end();
      };

      await sendLogs();

      const TERMINAL_STATUSES = new Set(['completed', 'failed']);
      if (TERMINAL_STATUSES.has(job.status)) {
        sendDone(job.status);
        return;
      }

      const pollIntervalMs = this.jobQueueService.getLogStreamPollIntervalMs();
      const interval = setInterval(async () => {
        try {
          await sendLogs();

          const current = await this.jobQueueService.getJob(jobId);
          if (!current || TERMINAL_STATUSES.has(current.status)) {
            clearInterval(interval);
            sendDone(current?.status ?? 'unknown');
          }
        } catch (error) {
          clearInterval(interval);
          next(error);
        }
      }, pollIntervalMs);

      req.on('close', () => {
        clearInterval(interval);
      });
    } catch (error) {
      next(error);
    }
  }
}
