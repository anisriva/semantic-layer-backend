import { AuditLogDao } from '@/daos/index.js';
import type { AuditLogWithMetrics } from '@/daos/audit-log.js';
import { PipelineStage, MetricsType } from '@/types/audit.js';

export interface AuditLogQueryOptions {
  stage?: PipelineStage;
  metricsType?: MetricsType;
  limit?: number;
  offset?: number;
}

export class AuditService {
  constructor(private readonly auditLogDao: AuditLogDao = new AuditLogDao()) {}

  /**
   * Gets audit logs for a job with optional filters and pagination.
   * Audit logs are immutable - this is a read-only operation.
   */
  async getJobAuditLogs(
    jobId: string,
    options?: AuditLogQueryOptions,
  ): Promise<AuditLogWithMetrics[]> {
    if (options?.metricsType) {
      return this.auditLogDao.findByJobAndMetricsType(jobId, options.metricsType, {
        limit: options?.limit,
        offset: options?.offset,
      });
    }
    return this.auditLogDao.findByJob(jobId, {
      limit: options?.limit,
      offset: options?.offset,
    });
  }

  /**
   * Gets audit logs for a conversation with optional filters and pagination.
   * Audit logs are immutable - this is a read-only operation.
   */
  async getConversationAuditLogs(
    conversationId: string,
    options?: AuditLogQueryOptions,
  ): Promise<AuditLogWithMetrics[]> {
    if (options?.metricsType) {
      return this.auditLogDao.findByConversationAndMetricsType(conversationId, options.metricsType, {
        limit: options?.limit,
        offset: options?.offset,
      });
    }
    return this.auditLogDao.findByConversation(conversationId, {
      limit: options?.limit,
      offset: options?.offset,
    });
  }
}
