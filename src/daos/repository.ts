import { prisma } from '@/connectors/database.js';
import type { Repository, RepositoryStatus, RepositorySourceType } from '@prisma/client';

export class RepositoryDao {
  /**
   * Creates a new repository with NOT_READY status.
   *
   * `sourceType` defaults to `LOCAL` (see `@/helpers/source-resolver.js`).
   * `gitUrl` is required for `GIT` sources (not yet processed by workers);
   * `localPath` is required for `LOCAL` sources.
   */
  async create(data: {
    name: string;
    description?: string;
    ownerId: string;
    sourceType?: RepositorySourceType;
    gitUrl?: string;
    localPath?: string;
  }): Promise<Repository> {
    return prisma.repository.create({
      data: {
        source_type: data.sourceType ?? 'LOCAL',
        git_url: data.gitUrl,
        local_path: data.localPath,
        name: data.name,
        description: data.description,
        owner_id: data.ownerId,
        status: 'NOT_READY',
      },
    });
  }

  /**
   * Finds a repository by ID.
   */
  async findById(id: string): Promise<Repository | null> {
    return prisma.repository.findUnique({
      where: { id },
      include: {
        owner: true,
        last_processed_job: true,
      },
    });
  }

  /**
   * Finds a repository by git URL.
   */
  async findByGitUrl(gitUrl: string): Promise<Repository | null> {
    return prisma.repository.findUnique({
      where: { git_url: gitUrl },
      include: {
        owner: true,
        last_processed_job: true,
      },
    });
  }

  /**
   * Lists all repositories.
   */
  async list(options?: {
    ownerId?: string;
    status?: RepositoryStatus;
    limit?: number;
    offset?: number;
  }): Promise<Repository[]> {
    const where: any = {};
    if (options?.ownerId) {
      where.owner_id = options.ownerId;
    }
    if (options?.status) {
      where.status = options.status;
    }

    return prisma.repository.findMany({
      where,
      include: {
        owner: true,
        last_processed_job: true,
      },
      orderBy: { created_at: 'desc' },
      take: options?.limit,
      skip: options?.offset,
    });
  }

  /**
   * Updates repository status.
   */
  async updateStatus(id: string, status: RepositoryStatus): Promise<Repository> {
    return prisma.repository.update({
      where: { id },
      data: { status },
    });
  }

  /**
   * Updates the last processed job ID (only on successful job completion).
   * This should be called in the same transaction that completes the job.
   */
  async updateLastProcessedJob(
    id: string,
    jobId: string,
  ): Promise<Repository> {
    return prisma.repository.update({
      where: { id },
      data: {
        last_processed_job_id: jobId,
        status: 'READY',
      },
    });
  }

  /**
   * Updates repository metadata.
   */
  async update(id: string, data: {
    name?: string;
    description?: string;
  }): Promise<Repository> {
    return prisma.repository.update({
      where: { id },
      data,
    });
  }

  /**
   * Deletes a repository along with its dependent rows (jobs/audit logs,
   * conversations/messages, access rails) in a single transaction.
   */
  async delete(id: string): Promise<Repository> {
    return prisma.$transaction(async (tx) => {
      // Clear the self-referencing pointer first so job deletion never
      // violates the Repository -> Job(last_processed_job_id) FK.
      await tx.repository.update({
        where: { id },
        data: { last_processed_job_id: null },
      });

      await tx.auditLog.deleteMany({ where: { job: { repository_id: id } } });
      await tx.jobLog.deleteMany({ where: { job: { repository_id: id } } });
      await tx.job.deleteMany({ where: { repository_id: id } });
      await tx.message.deleteMany({ where: { conversation: { repository_id: id } } });
      await tx.conversation.deleteMany({ where: { repository_id: id } });
      await tx.repositoryAccess.deleteMany({ where: { repository_id: id } });
      await tx.accessRequest.deleteMany({ where: { repository_id: id } });

      return tx.repository.delete({ where: { id } });
    });
  }
}
