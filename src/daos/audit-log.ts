import { prisma } from '@/connectors/database.js';
import type { AuditLog, AuditStatus } from '@prisma/client';

export interface CreateAuditLogData {
  jobId: string;
  step: string;
  status: AuditStatus;
  metrics?: Record<string, unknown>;
  errorMessage?: string;
}

export class AuditLogDao {
  /**
   * Creates a new audit log entry.
   */
  async create(data: CreateAuditLogData): Promise<AuditLog> {
    return prisma.auditLog.create({
      data: {
        job_id: data.jobId,
        step: data.step,
        status: data.status,
        metrics: data.metrics as any,
        error_message: data.errorMessage,
      },
    });
  }

  /**
   * Creates a started audit log entry.
   */
  async createStarted(jobId: string, step: string): Promise<AuditLog> {
    return this.create({
      jobId,
      step,
      status: 'started',
    });
  }

  /**
   * Creates a completed audit log entry with metrics.
   */
  async createCompleted(
    jobId: string,
    step: string,
    metrics?: Record<string, unknown>,
  ): Promise<AuditLog> {
    return this.create({
      jobId,
      step,
      status: 'completed',
      metrics,
    });
  }

  /**
   * Creates a failed audit log entry with error message.
   */
  async createFailed(
    jobId: string,
    step: string,
    errorMessage: string,
  ): Promise<AuditLog> {
    return this.create({
      jobId,
      step,
      status: 'failed',
      errorMessage,
    });
  }

  /**
   * Updates an existing audit log entry.
   */
  async update(
    id: string,
    data: {
      status?: AuditStatus;
      metrics?: Record<string, unknown>;
      errorMessage?: string;
      completedAt?: Date;
    },
  ): Promise<AuditLog> {
    return prisma.auditLog.update({
      where: { id },
      data: {
        status: data.status,
        metrics: data.metrics as any,
        error_message: data.errorMessage,
        completed_at: data.completedAt,
      },
    });
  }

  /**
   * Marks an audit log as completed with metrics.
   */
  async markCompleted(
    id: string,
    metrics?: Record<string, unknown>,
  ): Promise<AuditLog> {
    return this.update(id, {
      status: 'completed',
      metrics,
      completedAt: new Date(),
    });
  }

  /**
   * Marks an audit log as failed with error message.
   */
  async markFailed(id: string, errorMessage: string): Promise<AuditLog> {
    return this.update(id, {
      status: 'failed',
      errorMessage,
      completedAt: new Date(),
    });
  }

  /**
   * Finds audit logs for a job.
   */
  async findByJob(jobId: string): Promise<AuditLog[]> {
    return prisma.auditLog.findMany({
      where: { job_id: jobId },
      orderBy: { started_at: 'asc' },
    });
  }

  /**
   * Finds audit logs for a job by step.
   */
  async findByJobAndStep(jobId: string, step: string): Promise<AuditLog[]> {
    return prisma.auditLog.findMany({
      where: {
        job_id: jobId,
        step,
      },
      orderBy: { started_at: 'asc' },
    });
  }

  /**
   * Finds the latest audit log for a job and step.
   */
  async findLatestByJobAndStep(
    jobId: string,
    step: string,
  ): Promise<AuditLog | null> {
    return prisma.auditLog.findFirst({
      where: {
        job_id: jobId,
        step,
      },
      orderBy: { started_at: 'desc' },
    });
  }
}
