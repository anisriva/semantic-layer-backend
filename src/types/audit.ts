// All types imported from Prisma - no custom type definitions
import {
  PipelineStage,
  PipelineStatus,
  ScanType,
  MetricsType,
  OperationType,
  CostOperationType,
  ProviderType,
  type AuditLog,
  type PerformanceMetrics,
  type CostMetrics,
  type ResourceMetrics,
  type QualityMetrics,
  type BusinessMetrics,
} from '@prisma/client';

// Re-export for convenience
export {
  PipelineStage,
  PipelineStatus,
  ScanType,
  MetricsType,
  OperationType,
  CostOperationType,
  ProviderType,
};

export type {
  AuditLog,
  PerformanceMetrics,
  CostMetrics,
  ResourceMetrics,
  QualityMetrics,
  BusinessMetrics,
};

// Prisma-derived DAO types (omitting auto-generated fields)
export type CreateAuditLogData = Omit<
  AuditLog,
  'id' | 'started_at' | 'completed_at' | 'job' | 'conversation' | 'message' | 'user' | 'performance_metrics' | 'cost_metrics' | 'resource_metrics' | 'quality_metrics' | 'business_metrics'
> & {
  job_id?: string | null;
  conversation_id?: string | null;
  message_id?: string | null;
  stage: PipelineStage; // Required field
};

/**
 * Discriminated union identifying which execution context an `AuditLog`
 * entry belongs to. Used by `AuditLogDao`'s `createStartedForJob` /
 * `createStartedForConversation` family so callers cannot independently
 * supply `operationType`, `jobId`, and `conversationId` in an invalid
 * combination (Section 9/DAO API cleanup).
 */
export type AuditContext =
  | { operationType: typeof OperationType.JOB; jobId: string }
  | { operationType: typeof OperationType.CHAT; conversationId: string; messageId?: string | null };

export type CreatePerformanceMetricsData = Partial<Omit<
  PerformanceMetrics,
  'id' | 'audit_log'
>>;

export type CreateCostMetricsData = Partial<Omit<
  CostMetrics,
  'id' | 'audit_log'
>>;

export type CreateResourceMetricsData = Partial<Omit<
  ResourceMetrics,
  'id' | 'audit_log'
>>;

export type CreateQualityMetricsData = Partial<Omit<
  QualityMetrics,
  'id' | 'audit_log'
>>;

export type CreateBusinessMetricsData = Partial<Omit<
  BusinessMetrics,
  'id' | 'audit_log'
>>;
