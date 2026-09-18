import { z } from 'zod';
import { paginationSchema } from '../common/index.js';
import { PipelineStage, MetricsType } from '@/types/audit.js';

// Audit logs query params
export const auditLogsQuerySchema = paginationSchema.extend({
  stage: z.nativeEnum(PipelineStage).optional(),
  metricsType: z.nativeEnum(MetricsType).optional(),
});

export type AuditLogsQuery = z.infer<typeof auditLogsQuerySchema>;
