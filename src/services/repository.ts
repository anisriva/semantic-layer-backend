import { stat } from 'node:fs/promises';
import { RepositoryDao, JobDao, UserDao } from '@/daos/index.js';
import { generateCommitMarker, UnsupportedSourceTypeError } from '@/helpers/source-resolver.js';
import type { Repository, RepositoryStatus, RepositorySourceType } from '@prisma/client';

export interface CreateRepositoryData {
  name: string;
  description?: string;
  /** Defaults to `LOCAL`. `GIT` is accepted by the schema but not yet processed by workers (see Git Integration phase). */
  sourceType?: RepositorySourceType;
  /** Required when `sourceType` is `GIT`. */
  gitUrl?: string;
  /** Required when `sourceType` is `LOCAL` (default): an absolute path readable by the worker process. */
  localPath?: string;
}

export interface RepositoryWithDetails extends Repository {
  owner: {
    id: string;
    email: string;
    name: string;
    role: string;
  };
  last_processed_job: {
    id: string;
    commit_head: string;
    status: string;
    completed_at: Date | null;
  } | null;
}

export class RepositoryService {
  constructor(
    private readonly repositoryDao: RepositoryDao = new RepositoryDao(),
    private readonly jobDao: JobDao = new JobDao(),
    private readonly userDao: UserDao = new UserDao(),
  ) {}

  /**
   * Creates a new repository and initiates the initial INDEX job.
   *
   * MVP only supports `sourceType: 'LOCAL'` end-to-end (the worker resolves
   * `local_path` via `@/helpers/source-resolver.js`). `GIT` is rejected here
   * until the dedicated Git Integration phase implements cloning.
   */
  async createRepository(data: CreateRepositoryData): Promise<RepositoryWithDetails> {
    const sourceType = data.sourceType ?? 'LOCAL';

    if (sourceType === 'GIT') {
      throw new UnsupportedSourceTypeError('GIT');
    }

    if (!data.localPath) {
      throw new Error('localPath is required when sourceType is LOCAL');
    }
    await this.assertLocalPathIsAccessibleDirectory(data.localPath);

    // Get or create service user
    const serviceUser = await this.userDao.getOrCreateServiceUser();

    // Create repository with NOT_READY status
    const repository = await this.repositoryDao.create({
      sourceType,
      localPath: data.localPath,
      name: data.name,
      description: data.description,
      ownerId: serviceUser.id,
    });

    // Create initial INDEX job. LOCAL sources have no git history, so the
    // commit marker is synthetic (see generateCommitMarker); GIT sources will
    // resolve a real commit SHA here once the Git Integration phase lands.
    await this.jobDao.create({
      repositoryId: repository.id,
      type: 'INDEX',
      commitHead: generateCommitMarker(repository),
    });

    // Fetch the repository with details
    const repoWithDetails = await this.repositoryDao.findById(repository.id);
    if (!repoWithDetails) {
      throw new Error('Failed to retrieve created repository');
    }

    return repoWithDetails as RepositoryWithDetails;
  }

  /**
   * Gets a repository by ID.
   */
  async getRepository(id: string): Promise<RepositoryWithDetails | null> {
    const repository = await this.repositoryDao.findById(id);
    return repository as RepositoryWithDetails | null;
  }

  /**
   * Gets a repository by git URL (`GIT` sources only).
   */
  async getRepositoryByGitUrl(gitUrl: string): Promise<RepositoryWithDetails | null> {
    const repository = await this.repositoryDao.findByGitUrl(gitUrl);
    return repository as RepositoryWithDetails | null;
  }

  /**
   * Lists all repositories.
   */
  async listRepositories(options?: {
    status?: RepositoryStatus;
    limit?: number;
    offset?: number;
  }): Promise<RepositoryWithDetails[]> {
    const repositories = await this.repositoryDao.list(options);
    return repositories as RepositoryWithDetails[];
  }

  /**
   * Updates repository metadata.
   */
  async updateRepository(
    id: string,
    data: {
      name?: string;
      description?: string;
    },
  ): Promise<RepositoryWithDetails> {
    const repository = await this.repositoryDao.update(id, data);
    const repoWithDetails = await this.repositoryDao.findById(repository.id);
    if (!repoWithDetails) {
      throw new Error('Failed to retrieve updated repository');
    }
    return repoWithDetails as RepositoryWithDetails;
  }

  /**
   * Initiates a refresh by creating a REFRESH job.
   *
   * `commitHead` is optional for `LOCAL` sources: since there is no git
   * history, a synthetic marker is generated automatically (full re-scan is
   * always performed for `LOCAL` refreshes — delta detection requires a real
   * git diff and is unavailable until the Git Integration phase).
   */
  async refreshRepository(id: string, commitHead?: string): Promise<RepositoryWithDetails> {
    const repository = await this.repositoryDao.findById(id);
    if (!repository) {
      throw new Error('Repository not found');
    }

    if (repository.source_type === 'GIT' && !commitHead) {
      throw new Error('commitHead is required to refresh a GIT-sourced repository');
    }

    // Create REFRESH job
    await this.jobDao.create({
      repositoryId: repository.id,
      type: 'REFRESH',
      commitHead: commitHead ?? generateCommitMarker(repository),
    });

    // Update repository status to NOT_READY since it will be re-processed
    await this.repositoryDao.updateStatus(id, 'NOT_READY');

    // Fetch updated repository
    const repoWithDetails = await this.repositoryDao.findById(id);
    if (!repoWithDetails) {
      throw new Error('Failed to retrieve repository');
    }
    return repoWithDetails as RepositoryWithDetails;
  }

  /**
   * Deletes a repository.
   */
  async deleteRepository(id: string): Promise<RepositoryWithDetails> {
    const repository = await this.repositoryDao.findById(id);
    if (!repository) {
      throw new Error('Repository not found');
    }

    await this.repositoryDao.delete(id);
    return repository as RepositoryWithDetails;
  }

  /**
   * Gets the processed commit for a repository (derived from last_processed_job).
   */
  async getProcessedCommit(id: string): Promise<string | null> {
    const repository = await this.repositoryDao.findById(id);
    if (!repository?.last_processed_job_id) {
      return null;
    }

    // Get the job to retrieve the commit head
    const job = await this.jobDao.findById(repository.last_processed_job_id);
    if (!job) {
      return null;
    }

    return job.commit_head;
  }

  /**
   * Validates that `localPath` exists and is a directory the worker can scan.
   */
  private async assertLocalPathIsAccessibleDirectory(localPath: string): Promise<void> {
    let stats;
    try {
      stats = await stat(localPath);
    } catch (error) {
      throw new Error(`localPath "${localPath}" is not accessible: ${error instanceof Error ? error.message : String(error)}`);
    }

    if (!stats.isDirectory()) {
      throw new Error(`localPath "${localPath}" is not a directory`);
    }
  }
}
