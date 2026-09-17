/**
 * Worker Entry Point
 *
 * Long-running worker process that claims and processes jobs from PostgreSQL.
 * Owns polling, atomic job claims, heartbeats, retries, and semantic indexing.
 * Does not expose HTTP routes.
 *
 * Phase 2: Handles INDEX and REFRESH jobs (both full-scan for now).
 * Phase 3 will add delta detection for REFRESH jobs.
 */
import { getWorkerConfig, getFullAppConfig, type FullAppConfig } from '@/config/index.js';
import { JobQueueService, IndexingService } from '@/services/index.js';
import { RepositoryDao, AuditLogDao, JobLogDao } from '@/daos/index.js';
import { PipelineStage, MetricsType, ScanType } from '@/types/audit.js';
import { resolveSource } from '@/helpers/source-resolver.js';
import { resetCollection } from '@/helpers/collection-reset.js';
import { withJobLogCapture } from '@/helpers/job-log-capture.js';
import { randomUUID } from 'node:crypto';

class Worker {
  private readonly workerId: string;
  private readonly jobQueueService: JobQueueService;
  private readonly indexingService: IndexingService;
  private readonly repositoryDao: RepositoryDao;
  private readonly auditLogDao: AuditLogDao;
  private readonly jobLogDao: JobLogDao;
  private readonly config: FullAppConfig;
  private isRunning = false;
  private heartbeatInterval?: NodeJS.Timeout;
  private pollInterval?: NodeJS.Timeout;

  constructor(config?: FullAppConfig) {
    this.workerId = randomUUID();
    this.config = config ?? getFullAppConfig();
    this.jobQueueService = new JobQueueService(undefined, undefined, this.config);
    this.indexingService = new IndexingService(this.config);
    this.repositoryDao = new RepositoryDao();
    this.auditLogDao = new AuditLogDao();
    this.jobLogDao = new JobLogDao();
  }

  /**
   * Starts the worker polling loop.
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.log(`[Worker ${this.workerId}] Already running`);
      return;
    }

    this.isRunning = true;
    console.log(`[Worker ${this.workerId}] Starting worker...`);
    console.log(`[Worker ${this.workerId}] Poll interval: ${getWorkerConfig(this.config).pollIntervalMs}ms`);
    console.log(`[Worker ${this.workerId}] Heartbeat interval: ${getWorkerConfig(this.config).heartbeatIntervalMs}ms`);

    // Start heartbeat interval
    this.startHeartbeat();

    // Start polling loop
    this.startPolling();

    console.log(`[Worker ${this.workerId}] Worker started`);
  }

  /**
   * Stops the worker.
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      console.log(`[Worker ${this.workerId}] Not running`);
      return;
    }

    console.log(`[Worker ${this.workerId}] Stopping worker...`);
    this.isRunning = false;

    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    if (this.pollInterval) {
      clearTimeout(this.pollInterval);
    }

    console.log(`[Worker ${this.workerId}] Worker stopped`);
  }

  /**
   * Starts the heartbeat interval for the current job.
   */
  private startHeartbeat(): void {
    const heartbeatIntervalMs = getWorkerConfig(this.config).heartbeatIntervalMs;
    this.heartbeatInterval = setInterval(async () => {
      // Heartbeat logic will be handled per-job in the polling loop
      // This is a placeholder for future heartbeat management
    }, heartbeatIntervalMs);
  }

  /**
   * Starts the polling loop.
   */
  private startPolling(): void {
    const pollIntervalMs = getWorkerConfig(this.config).pollIntervalMs;

    const poll = async () => {
      if (!this.isRunning) {
        return;
      }

      try {
        await this.processNextJob();
      } catch (error) {
        console.error(`[Worker ${this.workerId}] Error in polling loop:`, error);
      }

      // Schedule next poll
      if (this.isRunning) {
        this.pollInterval = setTimeout(poll, pollIntervalMs);
      }
    };

    // Start first poll
    poll();
  }

  /**
   * Processes the next available job.
   */
  private async processNextJob(): Promise<void> {
    try {
      // Recover stale jobs before claiming
      await this.jobQueueService.recoverStaleJobs();

      // Claim next pending job
      const job = await this.jobQueueService.claimNextJob(this.workerId);
      if (!job) {
        console.log(`[Worker ${this.workerId}] No pending jobs to process`);
        return;
      }

      console.log(`[Worker ${this.workerId}] Claimed job ${job.id} (type: ${job.type}, repository: ${job.repository_id})`);

      // Process the job
      await this.processJob(job);
    } catch (error) {
      console.error(`[Worker ${this.workerId}] Error processing job:`, error);
    }
  }

  /**
   * Processes a single job. Wrapped in `withJobLogCapture` so every log line
   * emitted while this job is processing (including deep inside
   * `IndexingService`) is persisted for `GET /api/v1/jobs/:id/logs` (SSE) —
   * see `src/helpers/job-log-capture.ts`.
   */
  private async processJob(job: any): Promise<void> {
    return withJobLogCapture(job.id, this.jobLogDao, () => this.runJob(job));
  }

  private async runJob(job: any): Promise<void> {
    const heartbeatIntervalMs = getWorkerConfig(this.config).heartbeatIntervalMs;
    let heartbeatTimer: NodeJS.Timeout | null = null;

    try {
      // Start heartbeat for this job
      heartbeatTimer = setInterval(async () => {
        try {
          await this.jobQueueService.updateHeartbeat(job.id);
          console.log(`[Worker ${this.workerId}] Heartbeat sent for job ${job.id}`);
        } catch (error) {
          console.error(`[Worker ${this.workerId}] Failed to send heartbeat for job ${job.id}:`, error);
        }
      }, heartbeatIntervalMs);

      // Get repository details
      const repository = await this.repositoryDao.findById(job.repository_id);
      if (!repository) {
        throw new Error(`Repository ${job.repository_id} not found`);
      }

      console.log(`[Worker ${this.workerId}] Processing job ${job.id} for repository ${repository.name} (${repository.source_type === 'GIT' ? repository.git_url : repository.local_path})`);

      // Determine collection name (will be implemented with collection-naming helper in the
      // Delta-Aware Refresh phase, once Repository -> collection derivation is finalized)
      // For now, use a simple naming convention
      const collectionName = `repo-${repository.id}`;

      // Process based on job type
      if (job.type === 'INDEX') {
        await this.processIndexJob(job, repository, collectionName);
      } else if (job.type === 'REFRESH') {
        await this.processRefreshJob(job, repository, collectionName);
      } else {
        throw new Error(`Unknown job type: ${job.type}`);
      }

      // Mark job as completed
      await this.jobQueueService.markJobCompleted(job.id);
      console.log(`[Worker ${this.workerId}] Job ${job.id} completed successfully`);

      // Update repository pointer atomically in the same transaction
      await this.repositoryDao.updateLastProcessedJob(repository.id, job.id);
      console.log(`[Worker ${this.workerId}] Repository ${repository.id} last_processed_job_id updated to ${job.id}`);
    } catch (error) {
      console.error(`[Worker ${this.workerId}] Job ${job.id} failed:`, error);

      // Mark job as failed
      const errorMessage = error instanceof Error ? error.message : String(error);
      await this.jobQueueService.markJobFailed(job.id, errorMessage);

      // Check if we should retry
      const jobWithRetry = await this.jobQueueService.getJob(job.id);
      if (jobWithRetry && jobWithRetry.retry_count < getWorkerConfig(this.config).maxRetries) {
        console.log(`[Worker ${this.workerId}] Job ${job.id} will be retried (attempt ${jobWithRetry.retry_count + 1}/${getWorkerConfig(this.config).maxRetries})`);
        await this.jobQueueService.resetJobForRetry(job.id);
      } else {
        console.log(`[Worker ${this.workerId}] Job ${job.id} exceeded max retries, marking as failed`);
      }
    } finally {
      // Clear heartbeat timer
      if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
      }
    }
  }

  /**
   * Processes an INDEX job (full repository scan).
   */
  private async processIndexJob(job: any, repository: any, collectionName: string): Promise<void> {
    console.log(`[Worker ${this.workerId}] Processing INDEX job ${job.id}`);

    const resolveStartedAt = Date.now();
    const { path: repoPath } = await resolveSource(repository);

    // Record audit log for indexing start
    await this.auditLogDao.createStartedForJob(job.id, PipelineStage.RESOLVE_SOURCE, MetricsType.PERFORMANCE, {
      userId: job.triggered_by || undefined,
      workerId: this.workerId,
    });

    try {
      // Run indexing with job context for audit logging
      const result = await this.indexingService.indexPath(repoPath, collectionName, {
        jobId: job.id,
        auditLogDao: this.auditLogDao,
        userId: job.triggered_by || undefined,
        scanType: job.scan_type || ScanType.FULL,
      });

      console.log(`[Worker ${this.workerId}] INDEX job ${job.id} completed:`, result);

      // Record audit log for indexing completion
      const resolveDurationMs = Date.now() - resolveStartedAt;
      await this.auditLogDao.createCompletedWithPerformanceForJob(job.id, PipelineStage.RESOLVE_SOURCE, {
        duration_ms: resolveDurationMs,
        files_processed: result.fileCount,
        chunks_generated: result.chunkCount,
        files_per_second: result.fileCount / (resolveDurationMs / 1000),
        chunks_per_second: result.chunkCount / (resolveDurationMs / 1000),
        graph_node_count: result.graphNodeCount,
        graph_edge_count: result.graphEdgeCount,
      }, {
        userId: job.triggered_by || undefined,
        workerId: this.workerId,
      });
    } catch (error) {
      // Record audit log for indexing failure
      await this.auditLogDao.createFailedForJob(job.id, PipelineStage.RESOLVE_SOURCE, MetricsType.PERFORMANCE, {
        userId: job.triggered_by || undefined,
        workerId: this.workerId,
      });
      throw error;
    }
  }

  /**
   * Processes a REFRESH job. Currently always a full scan (same as INDEX);
   * delta-aware refresh is added once the Git Integration phase supplies
   * real git history to diff against (see `artifacts/new/2-phased-development-plan.md`).
   *
   * Because this is a full scan with no per-file/per-definition delta to
   * base a targeted deletion on (Section 9.7's file-level fallback, applied
   * unconditionally today), the target Qdrant collection is dropped first
   * so stale chunks from files that were renamed/deleted on disk since the
   * last run cannot linger — the collection is then transparently recreated
   * empty by `IndexingService.indexPath`'s vector-store initialization.
   */
  private async processRefreshJob(job: any, repository: any, collectionName: string): Promise<void> {
    console.log(`[Worker ${this.workerId}] Processing REFRESH job ${job.id}`);

    const { path: repoPath } = await resolveSource(repository);

    // Record audit log for the pre-refresh collection reset
    const resetStartedAt = Date.now();
    await this.auditLogDao.createStartedForJob(job.id, PipelineStage.RESET_COLLECTION, MetricsType.PERFORMANCE, {
      userId: job.triggered_by || undefined,
      workerId: this.workerId,
    });
    try {
      await resetCollection(collectionName, this.config);
      console.log(`[Worker ${this.workerId}] Collection "${collectionName}" reset before full re-scan`);
      const resetDurationMs = Date.now() - resetStartedAt;
      await this.auditLogDao.createCompletedWithPerformanceForJob(job.id, PipelineStage.RESET_COLLECTION, {
        duration_ms: resetDurationMs,
      }, {
        userId: job.triggered_by || undefined,
        workerId: this.workerId,
      });
    } catch (error) {
      await this.auditLogDao.createFailedForJob(job.id, PipelineStage.RESET_COLLECTION, MetricsType.PERFORMANCE, {
        userId: job.triggered_by || undefined,
        workerId: this.workerId,
      });
      throw error;
    }

    // Record audit log for refresh start
    const refreshStartedAt = Date.now();
    await this.auditLogDao.createStartedForJob(job.id, PipelineStage.REFRESH_COLLECTION, MetricsType.PERFORMANCE, {
      userId: job.triggered_by || undefined,
      workerId: this.workerId,
    });

    try {
      // Run indexing with job context for audit logging
      const result = await this.indexingService.indexPath(repoPath, collectionName, {
        jobId: job.id,
        auditLogDao: this.auditLogDao,
        userId: job.triggered_by || undefined,
        scanType: job.scan_type || ScanType.FULL,
      });

      console.log(`[Worker ${this.workerId}] REFRESH job ${job.id} completed:`, result);

      // Record audit log for refresh completion
      const refreshDurationMs = Date.now() - refreshStartedAt;
      await this.auditLogDao.createCompletedWithPerformanceForJob(job.id, PipelineStage.REFRESH_COLLECTION, {
        duration_ms: refreshDurationMs,
        files_processed: result.fileCount,
        chunks_generated: result.chunkCount,
        files_per_second: result.fileCount / (refreshDurationMs / 1000),
        chunks_per_second: result.chunkCount / (refreshDurationMs / 1000),
        graph_node_count: result.graphNodeCount,
        graph_edge_count: result.graphEdgeCount,
      }, {
        userId: job.triggered_by || undefined,
        workerId: this.workerId,
      });
    } catch (error) {
      // Record audit log for refresh failure
      await this.auditLogDao.createFailedForJob(job.id, PipelineStage.REFRESH_COLLECTION, MetricsType.PERFORMANCE, {
        userId: job.triggered_by || undefined,
        workerId: this.workerId,
      });
      throw error;
    }
  }
}

// Main entry point
async function main() {
  const worker = new Worker();

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('Received SIGINT, shutting down worker...');
    await worker.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('Received SIGTERM, shutting down worker...');
    await worker.stop();
    process.exit(0);
  });

  // Start worker
  await worker.start();

  // Keep process alive
  console.log('Worker process running. Press Ctrl+C to stop.');
}

// Only run main if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('Worker failed to start:', error);
    process.exit(1);
  });
}
