import { JobDao, AuditLogDao, JobLogDao } from '@/daos/index.js';
import type { Job, JobLog, JobStatus, JobType, ScanType } from '@prisma/client';
import { PipelineStage, MetricsType } from '@/types/audit.js';
import { getWorkerConfig, getFullAppConfig, type FullAppConfig } from '@/config/index.js';

export interface JobWithDetails extends Job {
  repository: {
    id: string;
    git_url: string;
    name: string;
    status: string;
  };
  audit_logs: Array<{
    id: string;
    step: string;
    status: string;
    metrics: unknown;
    error_message: string | null;
    started_at: Date;
    completed_at: Date | null;
  }>;
}

export class JobQueueService {
  constructor(
    private readonly jobDao: JobDao = new JobDao(),
    private readonly auditLogDao: AuditLogDao = new AuditLogDao(),
    private readonly fullConfig: FullAppConfig = getFullAppConfig(),
    private readonly jobLogDao: JobLogDao = new JobLogDao(),
  ) {}

  /**
   * Creates a new job with scan type
   */
  async createJob(data: {
    repositoryId: string;
    type: JobType;
    commitHead: string;
    triggeredBy?: string;
    scanType?: ScanType;
    jobMetadata?: unknown;
  }): Promise<Job> {
    return this.jobDao.create(data);
  }

  /**
   * Gets a job by ID with details.
   */
  async getJob(id: string): Promise<JobWithDetails | null> {
    const job = await this.jobDao.findById(id);
    return job as JobWithDetails | null;
  }

  /**
   * Lists jobs for a repository.
   */
  async listJobs(
    repositoryId: string,
    options?: {
      status?: JobStatus;
      type?: JobType;
      limit?: number;
      offset?: number;
    },
  ): Promise<JobWithDetails[]> {
    const jobs = await this.jobDao.listByRepository(repositoryId, options);
    return jobs as JobWithDetails[];
  }

  /**
   * Lists all pending jobs.
   */
  async listPendingJobs(): Promise<JobWithDetails[]> {
    const jobs = await this.jobDao.listPending();
    return jobs as JobWithDetails[];
  }

  /**
   * Atomically claims the next pending job for a worker.
   * Uses SELECT ... FOR UPDATE SKIP LOCKED for safe concurrent claiming.
   */
  async claimNextJob(workerId: string): Promise<JobWithDetails | null> {
    const job = await this.jobDao.claimNextPendingJob(workerId);
    if (!job) {
      return null;
    }

    const claimStartedAt = Date.now();
    await this.auditLogDao.createStartedForJob(job.id, PipelineStage.JOB_CLAIM, MetricsType.PERFORMANCE, {
      userId: job.triggered_by || undefined,
      workerId: workerId,
    });

    // Record completion with actual duration
    const claimDurationMs = Date.now() - claimStartedAt;
    await this.auditLogDao.createCompletedWithPerformanceForJob(job.id, PipelineStage.JOB_CLAIM, {
      duration_ms: claimDurationMs,
    }, {
      userId: job.triggered_by || undefined,
      workerId: workerId,
    });

    return job as JobWithDetails;
  }

  /**
   * Updates job heartbeat.
   */
  async updateHeartbeat(jobId: string): Promise<void> {
    await this.jobDao.updateHeartbeat(jobId);
  }

  /**
   * Marks a job as completed.
   * This should be called in the same transaction that updates the repository pointer.
   */
  async markJobCompleted(jobId: string): Promise<JobWithDetails> {
    const job = await this.jobDao.findById(jobId);
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    const durationMs = job.started_at ? Date.now() - job.started_at.getTime() : 0;

    await this.auditLogDao.createCompletedWithPerformanceForJob(jobId, PipelineStage.JOB_COMPLETE, {
      duration_ms: durationMs,
    }, {
      userId: job.triggered_by || undefined,
      workerId: job.worker_id || undefined,
    });

    const updatedJob = await this.jobDao.markCompleted(jobId);
    return updatedJob as JobWithDetails;
  }

  /**
   * Marks a job as failed with error message.
   */
  async markJobFailed(jobId: string, errorMessage: string): Promise<JobWithDetails> {
    const job = await this.jobDao.findById(jobId);
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    await this.auditLogDao.createFailedForJob(jobId, PipelineStage.JOB_FAILED, MetricsType.PERFORMANCE, {
      userId: job.triggered_by || undefined,
      workerId: job.worker_id || undefined,
    });

    const updatedJob = await this.jobDao.markFailed(jobId, errorMessage);
    return updatedJob as JobWithDetails;
  }

  /**
   * Resets a failed job for retry based on retry policy.
   */
  async resetJobForRetry(jobId: string): Promise<JobWithDetails | null> {
    const job = await this.jobDao.findById(jobId);
    if (!job) {
      return null;
    }

    const workerConfig = getWorkerConfig(this.fullConfig);
    if (job.retry_count >= workerConfig.maxRetries) {
      // Max retries exceeded, don't reset
      return null;
    }

    // Reset job to pending
    const resetJob = await this.jobDao.resetForRetry(jobId);

    // Record audit log for retry
    await this.auditLogDao.createStartedForJob(jobId, PipelineStage.JOB_RETRY, MetricsType.PERFORMANCE, {
      userId: job.triggered_by || undefined,
      workerId: job.worker_id || undefined,
    });

    return resetJob as JobWithDetails;
  }

  /**
   * Recovers stale processing jobs.
   * Jobs that haven't sent heartbeat within the stale threshold are reset to pending.
   */
  async recoverStaleJobs(): Promise<number> {
    const workerConfig = getWorkerConfig(this.fullConfig);
    const recoveredCount = await this.jobDao.recoverStaleJobs(workerConfig.staleAfterMs);

    if (recoveredCount > 0) {
      console.log(`[JobQueue] Recovered ${recoveredCount} stale jobs`);
    }

    return recoveredCount;
  }

  /**
   * Lists stale jobs for monitoring.
   */
  async listStaleJobs(): Promise<JobWithDetails[]> {
    const workerConfig = getWorkerConfig(this.fullConfig);
    const jobs = await this.jobDao.listStaleJobs(workerConfig.staleAfterMs);
    return jobs as JobWithDetails[];
  }

  /**
   * Gets audit logs for a job.
   */
  async getJobAuditLogs(jobId: string) {
    return this.auditLogDao.findByJob(jobId);
  }

  /**
   * Gets raw console-output log lines for a job (see `JobLog`/`job-log-capture.ts`),
   * optionally only those created after `afterId` — used to tail a job's
   * progress via `GET /api/v1/jobs/:id/logs` (SSE).
   */
  async getJobLogs(jobId: string, afterId?: string): Promise<JobLog[]> {
    return this.jobLogDao.listByJobSince(jobId, afterId);
  }

  /** Poll interval `GET /api/v1/jobs/:id/logs` should use between tail queries. */
  getLogStreamPollIntervalMs(): number {
    return getWorkerConfig(this.fullConfig).logStreamPollIntervalMs;
  }
}
