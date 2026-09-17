import { Request, Response, NextFunction } from 'express';
import { AuditService, type AuditLogQueryOptions } from '@/services/audit.js';
import { PipelineStage, MetricsType } from '@/types/audit.js';

export class AuditController {
  constructor(private readonly auditService: AuditService = new AuditService()) {}

  /**
   * GET /api/v1/jobs/:id/audit
   * Gets audit logs for a job with optional filters and pagination.
   * Audit logs are immutable - this is a read-only endpoint.
   */
  async getJobAuditLogs(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      if (!id) {
        res.status(400).json({ error: 'Job ID is required' });
        return;
      }
      const jobId: string = Array.isArray(id) ? (id[0] ?? '') : id;

      const { stage, metricsType, limit, offset } = req.query;

      const options: AuditLogQueryOptions = {};
      if (stage) {
        options.stage = stage as PipelineStage;
      }
      if (metricsType) {
        options.metricsType = metricsType as MetricsType;
      }
      if (limit) {
        options.limit = parseInt(String(limit), 10);
      }
      if (offset) {
        options.offset = parseInt(String(offset), 10);
      }

      const auditLogs = await this.auditService.getJobAuditLogs(jobId, options);
      res.json(auditLogs);
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/conversations/:id/audit
   * Gets audit logs for a conversation with optional filters and pagination.
   * Audit logs are immutable - this is a read-only endpoint.
   */
  async getConversationAuditLogs(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      if (!id) {
        res.status(400).json({ error: 'Conversation ID is required' });
        return;
      }
      const conversationId: string = Array.isArray(id) ? (id[0] ?? '') : id;

      const { stage, metricsType, limit, offset } = req.query;

      const options: AuditLogQueryOptions = {};
      if (stage) {
        options.stage = stage as PipelineStage;
      }
      if (metricsType) {
        options.metricsType = metricsType as MetricsType;
      }
      if (limit) {
        options.limit = parseInt(String(limit), 10);
      }
      if (offset) {
        options.offset = parseInt(String(offset), 10);
      }

      const auditLogs = await this.auditService.getConversationAuditLogs(conversationId, options);
      res.json(auditLogs);
    } catch (error) {
      next(error);
    }
  }
}
