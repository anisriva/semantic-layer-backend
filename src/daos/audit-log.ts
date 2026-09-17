import { prisma } from '@/connectors/database.js';
import {
  PipelineStage,
  PipelineStatus,
  MetricsType,
  OperationType,
  type AuditLog,
  type PerformanceMetrics,
  type CostMetrics,
  type ResourceMetrics,
} from '@prisma/client';
import type {
  CreateAuditLogData,
  CreatePerformanceMetricsData,
  CreateCostMetricsData,
  CreateResourceMetricsData,
} from '@/types/audit.js';

export type { CreateAuditLogData, AuditContext } from '@/types/audit.js';

/** Thrown when an `AuditContext`/`CreateAuditLogData` violates the JOB/CHAT invariant (Section 3). */
export class InvalidAuditContextError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidAuditContextError';
  }
}

/** An `AuditLog` row together with whichever metrics relation was requested via `include`. */
export type AuditLogWithMetrics = AuditLog & {
  performance_metrics?: PerformanceMetrics | null;
  cost_metrics?: CostMetrics | null;
  resource_metrics?: ResourceMetrics | null;
};

export class AuditLogDao {
  /**
   * Creates a new audit log entry.
   *
   * Enforces the JOB/CHAT invariant (Section 3): a JOB entry must have
   * `job_id` and no `conversation_id`; a CHAT entry must have
   * `conversation_id` and no `job_id`. This mirrors the database `CHECK`
   * constraint added alongside `operation_type`, so invalid combinations
   * are rejected before ever reaching PostgreSQL.
   */
  async create(data: CreateAuditLogData): Promise<AuditLog> {
    this.validateContext(data);

    return prisma.auditLog.create({
      data: {
        operation_type: data.operation_type,
        job_id: data.job_id || null,
        conversation_id: data.conversation_id || null,
        message_id: data.message_id || null,
        stage: data.stage,
        status: data.status,
        metrics_type: data.metrics_type,
        user_id: data.user_id || null,
        worker_id: data.worker_id || null,
      },
    });
  }

  private validateContext(data: Pick<CreateAuditLogData, 'operation_type' | 'job_id' | 'conversation_id'>): void {
    if (data.operation_type === OperationType.JOB) {
      if (!data.job_id) {
        throw new InvalidAuditContextError('JOB audit log entries require a job_id');
      }
      if (data.conversation_id) {
        throw new InvalidAuditContextError('JOB audit log entries must not have a conversation_id');
      }
    } else if (data.operation_type === OperationType.CHAT) {
      if (!data.conversation_id) {
        throw new InvalidAuditContextError('CHAT audit log entries require a conversation_id');
      }
      if (data.job_id) {
        throw new InvalidAuditContextError('CHAT audit log entries must not have a job_id');
      }
    }
  }

  /**
   * Creates a started audit log entry for a JOB execution.
   */
  async createStartedForJob(
    jobId: string,
    stage: PipelineStage,
    metricsType: MetricsType,
    options?: {
      userId?: string;
      workerId?: string;
    }
  ): Promise<AuditLog> {
    return this.create({
      operation_type: OperationType.JOB,
      job_id: jobId,
      conversation_id: null,
      message_id: null,
      stage,
      status: PipelineStatus.IN_PROGRESS,
      metrics_type: metricsType,
      user_id: options?.userId || null,
      worker_id: options?.workerId || null,
    });
  }

  /**
   * Creates a started audit log entry for a CHAT execution.
   */
  async createStartedForConversation(
    conversationId: string,
    stage: PipelineStage,
    metricsType: MetricsType,
    options?: {
      userId?: string;
      workerId?: string;
      messageId?: string;
    }
  ): Promise<AuditLog> {
    return this.create({
      operation_type: OperationType.CHAT,
      job_id: null,
      conversation_id: conversationId,
      message_id: options?.messageId || null,
      stage,
      status: PipelineStatus.IN_PROGRESS,
      metrics_type: metricsType,
      user_id: options?.userId || null,
      worker_id: options?.workerId || null,
    });
  }

  /**
   * Creates a completed audit log entry with performance metrics for a JOB execution.
   */
  async createCompletedWithPerformanceForJob(
    jobId: string,
    stage: PipelineStage,
    performanceData: CreatePerformanceMetricsData,
    options?: {
      userId?: string;
      workerId?: string;
    }
  ): Promise<{ auditLog: AuditLog; performanceMetrics: PerformanceMetrics }> {
    const auditLog = await this.create({
      operation_type: OperationType.JOB,
      job_id: jobId,
      conversation_id: null,
      message_id: null,
      stage,
      status: PipelineStatus.COMPLETED,
      metrics_type: MetricsType.PERFORMANCE,
      user_id: options?.userId || null,
      worker_id: options?.workerId || null,
    });

    const performanceMetrics = await this.insertPerformanceMetrics(auditLog.id, performanceData);

    return { auditLog, performanceMetrics };
  }

  /**
   * Creates a completed audit log entry with performance metrics for a CHAT execution.
   */
  async createCompletedWithPerformanceForConversation(
    conversationId: string,
    stage: PipelineStage,
    performanceData: CreatePerformanceMetricsData,
    options?: {
      userId?: string;
      workerId?: string;
      messageId?: string;
    }
  ): Promise<{ auditLog: AuditLog; performanceMetrics: PerformanceMetrics }> {
    const auditLog = await this.create({
      operation_type: OperationType.CHAT,
      job_id: null,
      conversation_id: conversationId,
      message_id: options?.messageId || null,
      stage,
      status: PipelineStatus.COMPLETED,
      metrics_type: MetricsType.PERFORMANCE,
      user_id: options?.userId || null,
      worker_id: options?.workerId || null,
    });

    const performanceMetrics = await this.insertPerformanceMetrics(auditLog.id, performanceData);

    return { auditLog, performanceMetrics };
  }

  private async insertPerformanceMetrics(
    auditLogId: string,
    performanceData: CreatePerformanceMetricsData,
  ): Promise<PerformanceMetrics> {
    return prisma.performanceMetrics.create({
      data: {
        audit_log_id: auditLogId,
        duration_ms: performanceData.duration_ms ?? 0,
        files_processed: performanceData.files_processed,
        chunks_generated: performanceData.chunks_generated,
        files_per_second: performanceData.files_per_second,
        chunks_per_second: performanceData.chunks_per_second,
        scan_file_count: performanceData.scan_file_count,
        scan_duration_ms: performanceData.scan_duration_ms,
        scan_files_per_second: performanceData.scan_files_per_second,
        processing_successful_files: performanceData.processing_successful_files,
        processing_failed_files: performanceData.processing_failed_files,
        processing_total_files: performanceData.processing_total_files,
        processing_duration_ms: performanceData.processing_duration_ms,
        processing_success_rate: performanceData.processing_success_rate,
        graph_node_count: performanceData.graph_node_count,
        graph_edge_count: performanceData.graph_edge_count,
        graph_duration_ms: performanceData.graph_duration_ms,
        graph_density: performanceData.graph_density,
      },
    });
  }

  /**
   * Creates a completed audit log entry with cost metrics for a JOB execution.
   */
  async createCompletedWithCostForJob(
    jobId: string,
    stage: PipelineStage,
    costData: CreateCostMetricsData,
    options?: {
      userId?: string;
      workerId?: string;
    }
  ): Promise<{ auditLog: AuditLog; costMetrics: CostMetrics }> {
    const auditLog = await this.create({
      operation_type: OperationType.JOB,
      job_id: jobId,
      conversation_id: null,
      message_id: null,
      stage,
      status: PipelineStatus.COMPLETED,
      metrics_type: MetricsType.COST,
      user_id: options?.userId || null,
      worker_id: options?.workerId || null,
    });

    const costMetrics = await this.insertCostMetrics(auditLog.id, costData);

    return { auditLog, costMetrics };
  }

  /**
   * Creates a completed audit log entry with cost metrics for a CHAT execution.
   */
  async createCompletedWithCostForConversation(
    conversationId: string,
    stage: PipelineStage,
    costData: CreateCostMetricsData,
    options?: {
      userId?: string;
      workerId?: string;
      messageId?: string;
    }
  ): Promise<{ auditLog: AuditLog; costMetrics: CostMetrics }> {
    const auditLog = await this.create({
      operation_type: OperationType.CHAT,
      job_id: null,
      conversation_id: conversationId,
      message_id: options?.messageId || null,
      stage,
      status: PipelineStatus.COMPLETED,
      metrics_type: MetricsType.COST,
      user_id: options?.userId || null,
      worker_id: options?.workerId || null,
    });

    const costMetrics = await this.insertCostMetrics(auditLog.id, costData);

    return { auditLog, costMetrics };
  }

  private async insertCostMetrics(
    auditLogId: string,
    costData: CreateCostMetricsData,
  ): Promise<CostMetrics> {
    return prisma.costMetrics.create({
      data: {
        audit_log_id: auditLogId,
        cost_operation_type: costData.cost_operation_type!,
        provider_type: costData.provider_type!,
        model_name: costData.model_name!,
        base_url: costData.base_url,
        prompt_tokens: costData.prompt_tokens,
        completion_tokens: costData.completion_tokens,
        total_tokens: costData.total_tokens,
        cost_usd: costData.cost_usd,
        cost_per_1k_prompt_tokens: costData.cost_per_1k_prompt_tokens,
        cost_per_1k_completion_tokens: costData.cost_per_1k_completion_tokens,
        duration_ms: costData.duration_ms,
        chunk_count: costData.chunk_count,
      },
    });
  }

  /**
   * Creates a completed audit log entry with resource metrics for a JOB execution.
   */
  async createCompletedWithResourceForJob(
    jobId: string,
    stage: PipelineStage,
    resourceData: CreateResourceMetricsData,
    options?: {
      userId?: string;
      workerId?: string;
    }
  ): Promise<{ auditLog: AuditLog; resourceMetrics: ResourceMetrics }> {
    const auditLog = await this.create({
      operation_type: OperationType.JOB,
      job_id: jobId,
      conversation_id: null,
      message_id: null,
      stage,
      status: PipelineStatus.COMPLETED,
      metrics_type: MetricsType.RESOURCE,
      user_id: options?.userId || null,
      worker_id: options?.workerId || null,
    });

    const resourceMetrics = await this.insertResourceMetrics(auditLog.id, resourceData);

    return { auditLog, resourceMetrics };
  }

  /**
   * Creates a completed audit log entry with resource metrics for a CHAT execution.
   */
  async createCompletedWithResourceForConversation(
    conversationId: string,
    stage: PipelineStage,
    resourceData: CreateResourceMetricsData,
    options?: {
      userId?: string;
      workerId?: string;
      messageId?: string;
    }
  ): Promise<{ auditLog: AuditLog; resourceMetrics: ResourceMetrics }> {
    const auditLog = await this.create({
      operation_type: OperationType.CHAT,
      job_id: null,
      conversation_id: conversationId,
      message_id: options?.messageId || null,
      stage,
      status: PipelineStatus.COMPLETED,
      metrics_type: MetricsType.RESOURCE,
      user_id: options?.userId || null,
      worker_id: options?.workerId || null,
    });

    const resourceMetrics = await this.insertResourceMetrics(auditLog.id, resourceData);

    return { auditLog, resourceMetrics };
  }

  private async insertResourceMetrics(
    auditLogId: string,
    resourceData: CreateResourceMetricsData,
  ): Promise<ResourceMetrics> {
    return prisma.resourceMetrics.create({
      data: {
        audit_log_id: auditLogId,
        memory_used_mb: resourceData.memory_used_mb,
        memory_peak_mb: resourceData.memory_peak_mb,
        cpu_percent: resourceData.cpu_percent,
        cpu_time_ms: resourceData.cpu_time_ms,
        storage_used_mb: resourceData.storage_used_mb,
        storage_freed_mb: resourceData.storage_freed_mb,
        network_bytes_sent: resourceData.network_bytes_sent,
        network_bytes_received: resourceData.network_bytes_received,
        active_workers: resourceData.active_workers,
        queue_depth: resourceData.queue_depth,
      },
    });
  }

  /**
   * Creates a failed audit log entry (no metrics, just status) for a JOB execution.
   */
  async createFailedForJob(
    jobId: string,
    stage: PipelineStage,
    metricsType: MetricsType,
    options?: {
      userId?: string;
      workerId?: string;
    }
  ): Promise<AuditLog> {
    return this.create({
      operation_type: OperationType.JOB,
      job_id: jobId,
      conversation_id: null,
      message_id: null,
      stage,
      status: PipelineStatus.FAILED,
      metrics_type: metricsType,
      user_id: options?.userId || null,
      worker_id: options?.workerId || null,
    });
  }

  /**
   * Creates a failed audit log entry (no metrics, just status) for a CHAT execution.
   */
  async createFailedForConversation(
    conversationId: string,
    stage: PipelineStage,
    metricsType: MetricsType,
    options?: {
      userId?: string;
      workerId?: string;
      messageId?: string;
    }
  ): Promise<AuditLog> {
    return this.create({
      operation_type: OperationType.CHAT,
      job_id: null,
      conversation_id: conversationId,
      message_id: options?.messageId || null,
      stage,
      status: PipelineStatus.FAILED,
      metrics_type: metricsType,
      user_id: options?.userId || null,
      worker_id: options?.workerId || null,
    });
  }

  /**
   * Finds audit logs for a job with specific metrics type
   */
  async findByJobAndMetricsType(
    jobId: string,
    metricsType: MetricsType
  ): Promise<AuditLogWithMetrics[]> {
    return prisma.auditLog.findMany({
      where: {
        job_id: jobId,
        metrics_type: metricsType,
      },
      orderBy: { started_at: 'asc' },
      include: {
        // Include the specific metrics based on type
        ...(metricsType === MetricsType.PERFORMANCE && { performance_metrics: true }),
        ...(metricsType === MetricsType.COST && { cost_metrics: true }),
        ...(metricsType === MetricsType.RESOURCE && { resource_metrics: true }),
        ...(metricsType === MetricsType.QUALITY && { quality_metrics: true }),
        ...(metricsType === MetricsType.BUSINESS && { business_metrics: true }),
      },
    });
  }

  /**
   * Gets cost summary for a job, broken down by `CostOperationType`.
   */
  async getJobCostSummary(jobId: string): Promise<{
    totalCostUsd: number;
    totalTokens: number;
    breakdownByOperation: Record<string, { cost: number; tokens: number }>;
  }> {
    const costMetrics = await prisma.costMetrics.findMany({
      where: {
        audit_log: {
          job_id: jobId,
        },
      },
    });

    return this.summarizeCostMetrics(costMetrics);
  }

  /**
   * Gets cost summary for a conversation, broken down by `CostOperationType`.
   */
  async getConversationCostSummary(conversationId: string): Promise<{
    totalCostUsd: number;
    totalTokens: number;
    breakdownByOperation: Record<string, { cost: number; tokens: number }>;
  }> {
    const costMetrics = await prisma.costMetrics.findMany({
      where: {
        audit_log: {
          conversation_id: conversationId,
        },
      },
    });

    return this.summarizeCostMetrics(costMetrics);
  }

  private summarizeCostMetrics(costMetrics: CostMetrics[]): {
    totalCostUsd: number;
    totalTokens: number;
    breakdownByOperation: Record<string, { cost: number; tokens: number }>;
  } {
    const summary = {
      totalCostUsd: 0,
      totalTokens: 0,
      breakdownByOperation: {} as Record<string, { cost: number; tokens: number }>,
    };

    for (const metric of costMetrics) {
      summary.totalCostUsd += metric.cost_usd || 0;
      summary.totalTokens += metric.total_tokens || 0;

      const op = metric.cost_operation_type;
      if (!summary.breakdownByOperation[op]) {
        summary.breakdownByOperation[op] = { cost: 0, tokens: 0 };
      }
      summary.breakdownByOperation[op].cost += metric.cost_usd || 0;
      summary.breakdownByOperation[op].tokens += metric.total_tokens || 0;
    }

    return summary;
  }

  /**
   * Finds audit logs for a job (legacy method for backward compatibility)
   */
  async findByJob(jobId: string): Promise<AuditLog[]> {
    return prisma.auditLog.findMany({
      where: { job_id: jobId },
      orderBy: { started_at: 'asc' },
    });
  }

  /**
   * Finds audit logs for a conversation.
   */
  async findByConversation(conversationId: string): Promise<AuditLog[]> {
    return prisma.auditLog.findMany({
      where: { conversation_id: conversationId },
      orderBy: { started_at: 'asc' },
    });
  }

  /**
   * Finds audit logs for a job by stage (legacy method for backward compatibility)
   */
  async findByJobAndStage(jobId: string, stage: PipelineStage): Promise<AuditLog[]> {
    return prisma.auditLog.findMany({
      where: {
        job_id: jobId,
        stage,
      },
      orderBy: { started_at: 'asc' },
    });
  }

  /**
   * Finds the latest audit log for a job and stage (legacy method for backward compatibility)
   */
  async findLatestByJobAndStage(
    jobId: string,
    stage: PipelineStage,
  ): Promise<AuditLog | null> {
    return prisma.auditLog.findFirst({
      where: {
        job_id: jobId,
        stage,
      },
      orderBy: { started_at: 'desc' },
    });
  }
}
