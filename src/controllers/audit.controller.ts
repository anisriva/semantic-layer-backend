import { Request, Response, NextFunction } from "express";
import { AuditService, type AuditLogQueryOptions } from "@/services/audit.js";
import type { ApiPaginatedResponse } from "@/types/common/index.js";
import type { AuditLog } from "@prisma/client";
import { ZodError } from "zod";
import { auditLogsQuerySchema } from "@/schemas/audit/index.js";

export class AuditController {
  constructor(
    private readonly auditService: AuditService = new AuditService(),
  ) {}

  /**
   * GET /api/v1/jobs/:id/audit
   * Gets audit logs for a job with optional filters and pagination.
   * Audit logs are immutable - this is a read-only endpoint.
   */
  async getJobAuditLogs(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<Response<ApiPaginatedResponse<AuditLog>>> {
    try {
      const { id } = req.params;
      if (!id) {
        return res
          .status(400)
          .json({ success: false, error: "Job ID is required" });
      }
      const jobId: string = id as string;

      const validatedQuery = auditLogsQuerySchema.parse(req.query);

      const options: AuditLogQueryOptions = {};
      if (validatedQuery.stage) {
        options.stage = validatedQuery.stage;
      }
      if (validatedQuery.metricsType) {
        options.metricsType = validatedQuery.metricsType;
      }
      if (validatedQuery.limit) {
        options.limit = validatedQuery.limit;
      }
      if (validatedQuery.offset) {
        options.offset = validatedQuery.offset;
      }

      const auditLogs = await this.auditService.getJobAuditLogs(jobId, options);
      return res.json({
        success: true,
        data: auditLogs,
        meta: {
          total: auditLogs.length,
          limit: validatedQuery.limit ?? auditLogs.length,
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
   * GET /api/v1/conversations/:id/audit
   * Gets audit logs for a conversation with optional filters and pagination.
   * Audit logs are immutable - this is a read-only endpoint.
   */
  async getConversationAuditLogs(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<Response<ApiPaginatedResponse<AuditLog>>> {
    try {
      const { id } = req.params;
      if (!id) {
        return res
          .status(400)
          .json({ success: false, error: "Conversation ID is required" });
      }
      const conversationId: string = id as string;

      const validatedQuery = auditLogsQuerySchema.parse(req.query);

      const options: AuditLogQueryOptions = {};
      if (validatedQuery.stage) {
        options.stage = validatedQuery.stage;
      }
      if (validatedQuery.metricsType) {
        options.metricsType = validatedQuery.metricsType;
      }
      if (validatedQuery.limit) {
        options.limit = validatedQuery.limit;
      }
      if (validatedQuery.offset) {
        options.offset = validatedQuery.offset;
      }

      const auditLogs = await this.auditService.getConversationAuditLogs(
        conversationId,
        options,
      );
      return res.json({
        success: true,
        data: auditLogs,
        meta: {
          total: auditLogs.length,
          limit: validatedQuery.limit ?? auditLogs.length,
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
   * GET /api/v1/jobs/:id/audit/stream (SSE)
   *
   * Streams audit log entries for job-related stages as they are created,
   * for tailing job progress in a UI. This complements `GET /api/v1/jobs/:id/logs`
   * which streams raw console output, while this endpoint streams structured
   * stage-level audit entries.
   *
   * Behavior:
   * 1. Replays every audit log recorded so far as `event: audit` frames.
   * 2. If the job is already in a terminal state (`completed`/`failed`),
   *    sends `event: done` and closes immediately.
   * 3. Otherwise polls for new audit logs and job-status changes at
   *    `app.worker.logStreamPollIntervalMs`, streaming new `event: audit`
   *    frames as they appear, until the job reaches a terminal state
   *    (then sends `event: done` and closes) or the client disconnects.
   */
  async streamJobAuditLogs(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const { id: rawId } = req.params;
      if (!rawId) {
        res.status(400).json({ success: false, error: "Job ID is required" });
        return;
      }
      const jobId: string = rawId as string;

      // Verify job exists
      const { JobQueueService } = await import("@/services/job-queue.js");
      const jobQueueService = new JobQueueService();
      const job = await jobQueueService.getJob(jobId);
      if (!job) {
        res.status(404).json({ error: "Job not found" });
        return;
      }

      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });

      let lastAuditId: string | undefined;
      const sendAuditLogs = async (): Promise<void> => {
        const auditLogs = await this.auditService.getJobAuditLogsSince(
          jobId,
          lastAuditId,
        );
        for (const auditLog of auditLogs) {
          res.write(`event: audit\ndata: ${JSON.stringify(auditLog)}\n\n`);
          lastAuditId = auditLog.id;
        }
      };

      const sendDone = (status: string): void => {
        res.write(`event: done\ndata: ${JSON.stringify({ status })}\n\n`);
        res.end();
      };

      await sendAuditLogs();

      const TERMINAL_STATUSES = new Set(["completed", "failed"]);
      if (TERMINAL_STATUSES.has(job.status)) {
        sendDone(job.status);
        return;
      }

      const pollIntervalMs = jobQueueService.getLogStreamPollIntervalMs();
      const interval = setInterval(async () => {
        try {
          await sendAuditLogs();

          const current = await jobQueueService.getJob(jobId);
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
