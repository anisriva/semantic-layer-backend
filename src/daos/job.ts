import { prisma } from '@/connectors/database.js';
import type { Job, JobStatus, JobType } from '@prisma/client';

export class JobDao {
  /**
   * Creates a new job.
   */
  async create(data: {
    repositoryId: string;
    type: JobType;
    commitHead: string;
  }): Promise<Job> {
    return prisma.job.create({
      data: {
        repository_id: data.repositoryId,
        type: data.type,
        commit_head: data.commitHead,
        status: 'pending',
      },
    });
  }

  /**
   * Finds a job by ID.
   */
  async findById(id: string): Promise<Job | null> {
    return prisma.job.findUnique({
      where: { id },
      include: {
        repository: {
          include: {
            owner: true,
          },
        },
        audit_logs: {
          orderBy: { started_at: 'asc' },
        },
      },
    });
  }

  /**
   * Lists jobs for a repository.
   */
  async listByRepository(
    repositoryId: string,
    options?: {
      status?: JobStatus;
      type?: JobType;
      limit?: number;
      offset?: number;
    },
  ): Promise<Job[]> {
    const where: any = { repository_id: repositoryId };
    if (options?.status) {
      where.status = options.status;
    }
    if (options?.type) {
      where.type = options.type;
    }

    return prisma.job.findMany({
      where,
      include: {
        repository: true,
      },
      orderBy: { created_at: 'desc' },
      take: options?.limit,
      skip: options?.offset,
    });
  }

  /**
   * Lists all pending jobs.
   */
  async listPending(): Promise<Job[]> {
    return prisma.job.findMany({
      where: { status: 'pending' },
      include: {
        repository: true,
      },
      orderBy: { created_at: 'asc' },
    });
  }

  /**
   * Atomically claims the next pending job using SELECT ... FOR UPDATE SKIP LOCKED.
   * This ensures safe concurrent job claiming across multiple workers.
   */
  async claimNextPendingJob(workerId: string): Promise<Job | null> {
    // Use raw SQL for SKIP LOCKED support
    const result = await prisma.$queryRaw<Array<{
      id: string;
      repository_id: string;
      type: JobType;
      status: JobStatus;
      commit_head: string;
      worker_id: string | null;
      error_message: string | null;
      retry_count: number;
      created_at: Date;
      started_at: Date | null;
      completed_at: Date | null;
      last_heartbeat: Date | null;
    }>>`
      SELECT id, repository_id, type, status, commit_head, worker_id, error_message, retry_count, created_at, started_at, completed_at, last_heartbeat
      FROM "Job"
      WHERE status = 'pending'
      ORDER BY created_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    `;

    if (result.length === 0) {
      return null;
    }

    const job = result[0];

    // Update the job to processing status with worker ID
    const updated = await prisma.job.update({
      where: { id: job.id },
      data: {
        status: 'processing',
        worker_id: workerId,
        started_at: new Date(),
        last_heartbeat: new Date(),
      },
    });

    return updated;
  }

  /**
   * Updates job heartbeat.
   */
  async updateHeartbeat(jobId: string): Promise<Job> {
    return prisma.job.update({
      where: { id: jobId },
      data: { last_heartbeat: new Date() },
    });
  }

  /**
   * Marks a job as completed.
   */
  async markCompleted(jobId: string): Promise<Job> {
    return prisma.job.update({
      where: { id: jobId },
      data: {
        status: 'completed',
        completed_at: new Date(),
      },
    });
  }

  /**
   * Marks a job as failed with error message and increments retry count.
   */
  async markFailed(jobId: string, errorMessage: string): Promise<Job> {
    return prisma.job.update({
      where: { id: jobId },
      data: {
        status: 'failed',
        error_message: errorMessage,
        completed_at: new Date(),
        retry_count: {
          increment: 1,
        },
      },
    });
  }

  /**
   * Resets a failed job back to pending for retry.
   */
  async resetForRetry(jobId: string): Promise<Job> {
    return prisma.job.update({
      where: { id: jobId },
      data: {
        status: 'pending',
        worker_id: null,
        started_at: null,
        error_message: null,
        last_heartbeat: null,
      },
    });
  }

  /**
   * Recovers stale processing jobs (jobs that haven't sent heartbeat recently).
   */
  async recoverStaleJobs(staleAfterMs: number): Promise<number> {
    const staleThreshold = new Date(Date.now() - staleAfterMs);

    const result = await prisma.job.updateMany({
      where: {
        status: 'processing',
        last_heartbeat: {
          lt: staleThreshold,
        },
      },
      data: {
        status: 'pending',
        worker_id: null,
        started_at: null,
        last_heartbeat: null,
      },
    });

    return result.count;
  }

  /**
   * Lists jobs that are processing but haven't sent heartbeat recently.
   */
  async listStaleJobs(staleAfterMs: number): Promise<Job[]> {
    const staleThreshold = new Date(Date.now() - staleAfterMs);

    return prisma.job.findMany({
      where: {
        status: 'processing',
        last_heartbeat: {
          lt: staleThreshold,
        },
      },
      include: {
        repository: true,
      },
    });
  }
}
