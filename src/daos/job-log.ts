import { prisma } from '@/connectors/database.js';
import type { JobLog, JobLogLevel } from '@prisma/client';

export interface CreateJobLogData {
  jobId: string;
  message: string;
  level?: JobLogLevel;
}

export class JobLogDao {
  /**
   * Appends a single log line for a job.
   */
  async create(data: CreateJobLogData): Promise<JobLog> {
    return prisma.jobLog.create({
      data: {
        job_id: data.jobId,
        message: data.message,
        level: data.level ?? 'info',
      },
    });
  }

  /**
   * Appends multiple log lines for a job in one insert (used by the
   * worker's buffered console capture to avoid one round-trip per line).
   */
  async createMany(entries: CreateJobLogData[]): Promise<number> {
    if (entries.length === 0) return 0;

    const result = await prisma.jobLog.createMany({
      data: entries.map((entry) => ({
        job_id: entry.jobId,
        message: entry.message,
        level: entry.level ?? 'info',
      })),
    });
    return result.count;
  }

  /**
   * Lists log lines for a job, oldest first.
   */
  async listByJob(jobId: string): Promise<JobLog[]> {
    return prisma.jobLog.findMany({
      where: { job_id: jobId },
      orderBy: { created_at: 'asc' },
    });
  }

  /**
   * Lists log lines for a job created after a given cursor (log ID),
   * oldest first — used to tail new lines during SSE streaming.
   */
  async listByJobSince(jobId: string, afterId?: string): Promise<JobLog[]> {
    if (!afterId) {
      return this.listByJob(jobId);
    }

    const cursor = await prisma.jobLog.findUnique({ where: { id: afterId } });
    if (!cursor) {
      return this.listByJob(jobId);
    }

    return prisma.jobLog.findMany({
      where: {
        job_id: jobId,
        created_at: { gt: cursor.created_at },
      },
      orderBy: { created_at: 'asc' },
    });
  }
}
