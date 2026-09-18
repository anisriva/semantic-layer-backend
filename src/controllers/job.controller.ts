import { Request, Response, NextFunction } from "express";
import { JobQueueService } from "@/services/job-queue.js";
import type {
  ApiResponse,
  ApiPaginatedResponse,
} from "@/types/common/index.js";
import type { Job } from "@prisma/client";
import { ZodError } from "zod";
import { listRepositoryJobsQuerySchema } from "@/schemas/job/index.js";

export class JobController {
  constructor(
    private readonly jobQueueService: JobQueueService = new JobQueueService(),
  ) {}

  /**
   * GET /api/v1/jobs/:id
   * Gets a specific job.
   */
  async getJob(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<Response<ApiResponse<Job>>> {
    try {
      const { id } = req.params;
      if (!id) {
        return res
          .status(400)
          .json({ success: false, error: "Job ID is required" });
      }
      const jobId: string = id as string;
      const job = await this.jobQueueService.getJob(jobId);

      if (!job) {
        return res.status(404).json({
          success: false,
          error: "Job not found",
        });
      }

      return res.json({ success: true, data: job });
    } catch (error) {
      next(error);
      return res
        .status(500)
        .json({ success: false, error: "Internal server error" });
    }
  }

  /**
   * GET /api/v1/repositories/:id/jobs
   * Lists jobs for a repository.
   */
  async listRepositoryJobs(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<Response<ApiPaginatedResponse<Job>>> {
    try {
      const { id } = req.params;
      if (!id) {
        return res
          .status(400)
          .json({ success: false, error: "Repository ID is required" });
      }
      const repositoryId: string = id as string;
      const validatedQuery = listRepositoryJobsQuerySchema.parse(req.query);

      const jobs = await this.jobQueueService.listJobs(repositoryId, {
        status: validatedQuery.status,
        type: validatedQuery.type,
        limit: validatedQuery.limit,
        offset: validatedQuery.offset,
      });

      return res.json({
        success: true,
        data: jobs,
        meta: {
          total: jobs.length,
          limit: validatedQuery.limit ?? jobs.length,
          offset: validatedQuery.offset ?? 0,
        },
      });
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({
          success: false,
          error: "Validation error",
          details: error.issues,
        });
      }
      next(error);
      return res
        .status(500)
        .json({ success: false, error: "Internal server error" });
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
  async streamJobLogs(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const { id: rawId } = req.params;
      if (!rawId) {
        res.status(400).json({ error: "Job ID is required" });
        return;
      }
      const jobId: string = rawId as string;

      const job = await this.jobQueueService.getJob(jobId);
      if (!job) {
        res.status(404).json({ error: "Job not found" });
        return;
      }

      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
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

      const TERMINAL_STATUSES = new Set(["completed", "failed"]);
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
            sendDone(current?.status ?? "unknown");
          }
        } catch (error) {
          clearInterval(interval);
          next(error);
        }
      }, pollIntervalMs);

      req.on("close", () => {
        clearInterval(interval);
      });
    } catch (error) {
      next(error);
    }
  }
}
