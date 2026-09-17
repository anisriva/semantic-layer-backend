import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '@/connectors/database.js';
import { AuditLogDao, InvalidAuditContextError } from '@/daos/audit-log.js';
import { JobDao } from '@/daos/job.js';
import { RepositoryDao } from '@/daos/repository.js';
import { UserDao } from '@/daos/user.js';
import { MessageDao } from '@/daos/message.js';
import { PipelineStage, PipelineStatus, MetricsType, ScanType, OperationType } from '@/types/audit.js';

describe('AuditLogDao', () => {
  let auditLogDao: AuditLogDao;
  let jobDao: JobDao;
  let repositoryDao: RepositoryDao;
  let userDao: UserDao;
  let messageDao: MessageDao;
  let testUserId: string;
  let testRepositoryId: string;
  let testJobId: string;

  beforeAll(async () => {
    auditLogDao = new AuditLogDao();
    jobDao = new JobDao();
    repositoryDao = new RepositoryDao();
    userDao = new UserDao();
    messageDao = new MessageDao();

    // Use a unique email to avoid conflicts
    const uniqueEmail = `audit-test-${Date.now()}@example.com`;

    // Create test user
    const user = await userDao.create({
      email: uniqueEmail,
      name: 'Audit Test User',
      role: 'REGULAR',
    });
    testUserId = user.id;

    // Create test repository
    const repository = await repositoryDao.create({
      name: 'Audit Test Repository',
      description: 'Test repository for audit logging',
      sourceType: 'LOCAL',
      localPath: '/tmp/audit-test-repo',
      ownerId: testUserId,
    });
    testRepositoryId = repository.id;

    // Create test job
    const job = await jobDao.create({
      repositoryId: testRepositoryId,
      type: 'INDEX',
      commitHead: 'abc123',
      triggeredBy: testUserId,
      scanType: ScanType.FULL,
    });
    testJobId = job.id;
  });

  afterAll(async () => {
    // Cleanup in reverse order of creation
    if (testJobId) {
      // Delete metrics first due to foreign key constraints
      await prisma.performanceMetrics.deleteMany({
        where: { audit_log: { job_id: testJobId } },
      });
      await prisma.costMetrics.deleteMany({
        where: { audit_log: { job_id: testJobId } },
      });
      await prisma.resourceMetrics.deleteMany({
        where: { audit_log: { job_id: testJobId } },
      });
      await prisma.auditLog.deleteMany({ where: { job_id: testJobId } });
      await prisma.job.delete({ where: { id: testJobId } });
    }
    if (testRepositoryId) {
      await prisma.repository.delete({ where: { id: testRepositoryId } });
    }
    if (testUserId) {
      await prisma.user.delete({ where: { id: testUserId } });
    }
  });

  describe('createStartedForJob', () => {
    it('should create a started audit log entry for a job', async () => {
      const auditLog = await auditLogDao.createStartedForJob(
        testJobId,
        PipelineStage.SCAN_FILES,
        MetricsType.PERFORMANCE,
        {
          userId: testUserId,
          workerId: 'worker-1',
        }
      );

      expect(auditLog).toBeDefined();
      expect(auditLog.operation_type).toBe(OperationType.JOB);
      expect(auditLog.job_id).toBe(testJobId);
      expect(auditLog.conversation_id).toBeNull();
      expect(auditLog.stage).toBe(PipelineStage.SCAN_FILES);
      expect(auditLog.status).toBe(PipelineStatus.IN_PROGRESS);
      expect(auditLog.metrics_type).toBe(MetricsType.PERFORMANCE);
      expect(auditLog.user_id).toBe(testUserId);
      expect(auditLog.worker_id).toBe('worker-1');
      expect(auditLog.started_at).toBeDefined();
      expect(auditLog.completed_at).toBeNull();
    });

    it('should create a started audit log entry without optional fields', async () => {
      const auditLog = await auditLogDao.createStartedForJob(
        testJobId,
        PipelineStage.PARSE_FILES,
        MetricsType.COST
      );

      expect(auditLog).toBeDefined();
      expect(auditLog.job_id).toBe(testJobId);
      expect(auditLog.user_id).toBeNull();
      expect(auditLog.worker_id).toBeNull();
    });
  });

  describe('createCompletedWithPerformanceForJob', () => {
    it('should create a completed audit log with performance metrics', async () => {
      const durationMs = 1000;
      const { auditLog, performanceMetrics } = await auditLogDao.createCompletedWithPerformanceForJob(
        testJobId,
        PipelineStage.SCAN_FILES,
        {
          duration_ms: durationMs,
          scan_file_count: 10,
          scan_duration_ms: durationMs,
          scan_files_per_second: 10 / (durationMs / 1000),
        },
        {
          userId: testUserId,
          workerId: 'worker-1',
        }
      );

      expect(auditLog).toBeDefined();
      expect(auditLog.operation_type).toBe(OperationType.JOB);
      expect(auditLog.status).toBe(PipelineStatus.COMPLETED);
      expect(auditLog.completed_at).toBeDefined();

      expect(performanceMetrics).toBeDefined();
      expect(performanceMetrics.duration_ms).toBe(durationMs);
      expect(performanceMetrics.scan_file_count).toBe(10);
      expect(performanceMetrics.scan_duration_ms).toBe(durationMs);
    });

    it('should calculate graph density correctly', async () => {
      const graphNodeCount = 100;
      const graphEdgeCount = 200;
      const expectedDensity = (2 * graphEdgeCount) / (graphNodeCount * (graphNodeCount - 1));

      const { performanceMetrics } = await auditLogDao.createCompletedWithPerformanceForJob(
        testJobId,
        PipelineStage.BUILD_GRAPH,
        {
          duration_ms: 500,
          graph_node_count: graphNodeCount,
          graph_edge_count: graphEdgeCount,
          graph_duration_ms: 500,
          graph_density: expectedDensity,
        }
      );

      expect(performanceMetrics.graph_density).toBeCloseTo(expectedDensity, 4);
    });
  });

  describe('createCompletedWithCostForJob', () => {
    it('should create a completed audit log with cost metrics', async () => {
      const { auditLog, costMetrics } = await auditLogDao.createCompletedWithCostForJob(
        testJobId,
        PipelineStage.ENRICH_CHUNKS,
        {
          cost_operation_type: 'EMBEDDING',
          provider_type: 'OPENAI',
          model_name: 'text-embedding-3-small',
          base_url: 'https://api.openai.com/v1',
          prompt_tokens: 1000,
          completion_tokens: 0,
          total_tokens: 1000,
          cost_usd: 0.0001,
          cost_per_1k_prompt_tokens: 0.0001,
          cost_per_1k_completion_tokens: 0,
          duration_ms: 200,
          chunk_count: 10,
        },
        {
          userId: testUserId,
        }
      );

      expect(auditLog).toBeDefined();
      expect(auditLog.operation_type).toBe(OperationType.JOB);
      expect(auditLog.status).toBe(PipelineStatus.COMPLETED);
      expect(auditLog.metrics_type).toBe(MetricsType.COST);

      expect(costMetrics).toBeDefined();
      expect(costMetrics.cost_operation_type).toBe('EMBEDDING');
      expect(costMetrics.provider_type).toBe('OPENAI');
      expect(costMetrics.total_tokens).toBe(1000);
      expect(costMetrics.cost_usd).toBe(0.0001);
    });
  });

  describe('createCompletedWithResourceForJob', () => {
    it('should create a completed audit log with resource metrics', async () => {
      const { auditLog, resourceMetrics } = await auditLogDao.createCompletedWithResourceForJob(
        testJobId,
        PipelineStage.INDEX_CHUNKS,
        {
          memory_used_mb: 512,
          memory_peak_mb: 1024,
          cpu_percent: 75.5,
          cpu_time_ms: 1000,
          storage_used_mb: 2048,
          storage_freed_mb: 0,
          network_bytes_sent: 1024n,
          network_bytes_received: 2048n,
          active_workers: 2,
          queue_depth: 5,
        },
        {
          userId: testUserId,
        }
      );

      expect(auditLog).toBeDefined();
      expect(auditLog.status).toBe(PipelineStatus.COMPLETED);
      expect(auditLog.metrics_type).toBe(MetricsType.RESOURCE);

      expect(resourceMetrics).toBeDefined();
      expect(resourceMetrics.memory_used_mb).toBe(512);
      expect(resourceMetrics.memory_peak_mb).toBe(1024);
      expect(resourceMetrics.cpu_percent).toBe(75.5);
      expect(resourceMetrics.active_workers).toBe(2);
    });
  });

  describe('createFailedForJob', () => {
    it('should create a failed audit log entry', async () => {
      const auditLog = await auditLogDao.createFailedForJob(
        testJobId,
        PipelineStage.SCAN_FILES,
        MetricsType.PERFORMANCE,
        {
          userId: testUserId,
          workerId: 'worker-1',
        }
      );

      expect(auditLog).toBeDefined();
      expect(auditLog.status).toBe(PipelineStatus.FAILED);
      expect(auditLog.user_id).toBe(testUserId);
      expect(auditLog.worker_id).toBe('worker-1');
    });
  });

  describe('findByJobAndMetricsType', () => {
    it('should find audit logs for a job by metrics type', async () => {
      // Create test audit logs
      await auditLogDao.createCompletedWithPerformanceForJob(
        testJobId,
        PipelineStage.SCAN_FILES,
        {
          duration_ms: 100,
          scan_file_count: 5,
          scan_duration_ms: 100,
          scan_files_per_second: 50,
        }
      );

      await auditLogDao.createCompletedWithCostForJob(
        testJobId,
        PipelineStage.ENRICH_CHUNKS,
        {
          cost_operation_type: 'EMBEDDING',
          provider_type: 'OPENAI',
          model_name: 'text-embedding-3-small',
          base_url: 'https://api.openai.com/v1',
          prompt_tokens: 500,
          completion_tokens: 0,
          total_tokens: 500,
          cost_usd: 0.00005,
          cost_per_1k_prompt_tokens: 0.0001,
          cost_per_1k_completion_tokens: 0,
          duration_ms: 100,
          chunk_count: 5,
        }
      );

      const performanceLogs = await auditLogDao.findByJobAndMetricsType(testJobId, MetricsType.PERFORMANCE);
      expect(performanceLogs.length).toBeGreaterThan(0);
      const [firstPerformanceLog] = performanceLogs;
      expect(firstPerformanceLog?.metrics_type).toBe(MetricsType.PERFORMANCE);
      expect(firstPerformanceLog?.performance_metrics).toBeDefined();

      const costLogs = await auditLogDao.findByJobAndMetricsType(testJobId, MetricsType.COST);
      expect(costLogs.length).toBeGreaterThan(0);
      const [firstCostLog] = costLogs;
      expect(firstCostLog?.metrics_type).toBe(MetricsType.COST);
      expect(firstCostLog?.cost_metrics).toBeDefined();
    });
  });

  describe('getJobCostSummary', () => {
    it('should aggregate cost metrics for a job, broken down by CostOperationType', async () => {
      // Clean up any existing cost metrics for this job first
      await prisma.costMetrics.deleteMany({
        where: { audit_log: { job_id: testJobId } },
      });
      await prisma.auditLog.deleteMany({
        where: { job_id: testJobId, metrics_type: MetricsType.COST },
      });

      // Create cost metrics
      await auditLogDao.createCompletedWithCostForJob(
        testJobId,
        PipelineStage.ENRICH_CHUNKS,
        {
          cost_operation_type: 'EMBEDDING',
          provider_type: 'OPENAI',
          model_name: 'text-embedding-3-small',
          base_url: 'https://api.openai.com/v1',
          prompt_tokens: 1000,
          completion_tokens: 0,
          total_tokens: 1000,
          cost_usd: 0.0001,
          cost_per_1k_prompt_tokens: 0.0001,
          cost_per_1k_completion_tokens: 0,
          duration_ms: 100,
          chunk_count: 10,
        }
      );

      await auditLogDao.createCompletedWithCostForJob(
        testJobId,
        PipelineStage.ENRICH_CHUNKS,
        {
          cost_operation_type: 'CHAT_COMPLETION',
          provider_type: 'OPENAI',
          model_name: 'gpt-4',
          base_url: 'https://api.openai.com/v1',
          prompt_tokens: 500,
          completion_tokens: 300,
          total_tokens: 800,
          cost_usd: 0.03,
          cost_per_1k_prompt_tokens: 0.03,
          cost_per_1k_completion_tokens: 0.06,
          duration_ms: 2000,
          chunk_count: 0,
        }
      );

      const summary = await auditLogDao.getJobCostSummary(testJobId);

      expect(summary.totalCostUsd).toBe(0.0301);
      expect(summary.totalTokens).toBe(1800);
      expect(summary.breakdownByOperation).toHaveProperty('EMBEDDING');
      expect(summary.breakdownByOperation).toHaveProperty('CHAT_COMPLETION');
      expect(summary.breakdownByOperation.EMBEDDING?.cost).toBe(0.0001);
      expect(summary.breakdownByOperation.EMBEDDING?.tokens).toBe(1000);
      expect(summary.breakdownByOperation.CHAT_COMPLETION?.cost).toBe(0.03);
      expect(summary.breakdownByOperation.CHAT_COMPLETION?.tokens).toBe(800);
    });
  });

  describe('conversation-level (CHAT) metrics', () => {
    let conversationId: string;

    afterAll(async () => {
      if (conversationId) {
        await prisma.costMetrics.deleteMany({
          where: { audit_log: { conversation_id: conversationId } },
        });
        await prisma.performanceMetrics.deleteMany({
          where: { audit_log: { conversation_id: conversationId } },
        });
        await prisma.auditLog.deleteMany({ where: { conversation_id: conversationId } });
        await prisma.message.deleteMany({ where: { conversation_id: conversationId } });
        await prisma.conversation.delete({ where: { id: conversationId } });
      }
    });

    it('should create audit logs for conversation-level metrics', async () => {
      // Create a test conversation first
      const conversation = await prisma.conversation.create({
        data: {
          repository_id: testRepositoryId,
          user_id: testUserId,
          title: 'Test Conversation',
        },
      });
      conversationId = conversation.id;

      const auditLog = await auditLogDao.createStartedForConversation(
        conversation.id,
        PipelineStage.CHAT_COMPLETION,
        MetricsType.COST,
        {
          userId: testUserId,
        }
      );

      expect(auditLog).toBeDefined();
      expect(auditLog.operation_type).toBe(OperationType.CHAT);
      expect(auditLog.conversation_id).toBe(conversation.id);
      expect(auditLog.job_id).toBeNull();
      expect(auditLog.user_id).toBe(testUserId);

      const { costMetrics } = await auditLogDao.createCompletedWithCostForConversation(
        conversation.id,
        PipelineStage.CHAT_COMPLETION,
        {
          cost_operation_type: 'CHAT_COMPLETION',
          provider_type: 'OPENAI',
          model_name: 'gpt-4',
          base_url: 'https://api.openai.com/v1',
          prompt_tokens: 100,
          completion_tokens: 50,
          total_tokens: 150,
          cost_usd: 0.006,
          cost_per_1k_prompt_tokens: 0.03,
          cost_per_1k_completion_tokens: 0.06,
          duration_ms: 500,
          chunk_count: 0,
        },
        {
          userId: testUserId,
        }
      );

      expect(costMetrics).toBeDefined();
      expect(costMetrics.cost_operation_type).toBe('CHAT_COMPLETION');
      expect(costMetrics.total_tokens).toBe(150);
    });

    it('should attribute a CHAT audit entry to the triggering user Message via message_id', async () => {
      const conversation = conversationId
        ? { id: conversationId }
        : await prisma.conversation.create({
            data: { repository_id: testRepositoryId, user_id: testUserId, title: 'Message-attributed conversation' },
          });
      if (!conversationId) conversationId = conversation.id;

      const message = await messageDao.create({
        conversationId: conversation.id,
        role: 'user',
        content: 'What does this repository do?',
      });

      const auditLog = await auditLogDao.createStartedForConversation(
        conversation.id,
        PipelineStage.RETRIEVAL,
        MetricsType.PERFORMANCE,
        { userId: testUserId, messageId: message.id }
      );

      expect(auditLog.message_id).toBe(message.id);
      expect(auditLog.conversation_id).toBe(conversation.id);

      await prisma.auditLog.deleteMany({ where: { id: auditLog.id } });
      await prisma.message.delete({ where: { id: message.id } });
    });

    it('should aggregate CHAT cost metrics for a conversation, including EMBEDDING and CHAT_COMPLETION', async () => {
      const conversation = await prisma.conversation.create({
        data: { repository_id: testRepositoryId, user_id: testUserId, title: 'Cost summary conversation' },
      });

      await auditLogDao.createCompletedWithCostForConversation(
        conversation.id,
        PipelineStage.RETRIEVAL,
        {
          cost_operation_type: 'EMBEDDING',
          provider_type: 'CUSTOM',
          model_name: 'nomic-embed-text',
          base_url: 'http://localhost:11434/v1',
          prompt_tokens: 12,
          completion_tokens: 0,
          total_tokens: 12,
          cost_usd: 0,
          duration_ms: 40,
        }
      );

      await auditLogDao.createCompletedWithCostForConversation(
        conversation.id,
        PipelineStage.CHAT_COMPLETION,
        {
          cost_operation_type: 'CHAT_COMPLETION',
          provider_type: 'CUSTOM',
          model_name: 'llama3',
          base_url: 'http://localhost:11434/v1',
          prompt_tokens: 200,
          completion_tokens: 80,
          total_tokens: 280,
          cost_usd: 0,
          duration_ms: 900,
        }
      );

      const summary = await auditLogDao.getConversationCostSummary(conversation.id);
      expect(summary.totalTokens).toBe(292);
      expect(summary.breakdownByOperation).toHaveProperty('EMBEDDING');
      expect(summary.breakdownByOperation).toHaveProperty('CHAT_COMPLETION');

      await prisma.costMetrics.deleteMany({ where: { audit_log: { conversation_id: conversation.id } } });
      await prisma.auditLog.deleteMany({ where: { conversation_id: conversation.id } });
      await prisma.conversation.delete({ where: { id: conversation.id } });
    });
  });

  describe('JOB vs CHAT discrimination', () => {
    it('createStartedForJob should set operation_type=JOB, job_id populated, conversation_id null', async () => {
      const auditLog = await auditLogDao.createStartedForJob(testJobId, PipelineStage.JOB_CLAIM, MetricsType.PERFORMANCE);
      expect(auditLog.operation_type).toBe(OperationType.JOB);
      expect(auditLog.job_id).toBe(testJobId);
      expect(auditLog.conversation_id).toBeNull();
    });

    it('createStartedForConversation should set operation_type=CHAT, conversation_id populated, job_id null', async () => {
      const conversation = await prisma.conversation.create({
        data: { repository_id: testRepositoryId, user_id: testUserId, title: 'Discrimination conversation' },
      });

      const auditLog = await auditLogDao.createStartedForConversation(conversation.id, PipelineStage.RETRIEVAL, MetricsType.PERFORMANCE);
      expect(auditLog.operation_type).toBe(OperationType.CHAT);
      expect(auditLog.conversation_id).toBe(conversation.id);
      expect(auditLog.job_id).toBeNull();

      await prisma.auditLog.deleteMany({ where: { conversation_id: conversation.id } });
      await prisma.conversation.delete({ where: { id: conversation.id } });
    });
  });

  describe('invalid audit contexts', () => {
    it('should reject a JOB entry with no job_id', async () => {
      await expect(
        auditLogDao.create({
          operation_type: OperationType.JOB,
          job_id: null,
          conversation_id: null,
          message_id: null,
          stage: PipelineStage.JOB_CLAIM,
          status: PipelineStatus.IN_PROGRESS,
          metrics_type: MetricsType.PERFORMANCE,
          user_id: null,
          worker_id: null,
        })
      ).rejects.toThrow(InvalidAuditContextError);
    });

    it('should reject a CHAT entry with no conversation_id', async () => {
      await expect(
        auditLogDao.create({
          operation_type: OperationType.CHAT,
          job_id: null,
          conversation_id: null,
          message_id: null,
          stage: PipelineStage.RETRIEVAL,
          status: PipelineStatus.IN_PROGRESS,
          metrics_type: MetricsType.PERFORMANCE,
          user_id: null,
          worker_id: null,
        })
      ).rejects.toThrow(InvalidAuditContextError);
    });

    it('should reject an entry with both job_id and conversation_id', async () => {
      const conversation = await prisma.conversation.create({
        data: { repository_id: testRepositoryId, user_id: testUserId, title: 'Invalid-context conversation' },
      });

      await expect(
        auditLogDao.create({
          operation_type: OperationType.JOB,
          job_id: testJobId,
          conversation_id: conversation.id,
          message_id: null,
          stage: PipelineStage.JOB_CLAIM,
          status: PipelineStatus.IN_PROGRESS,
          metrics_type: MetricsType.PERFORMANCE,
          user_id: null,
          worker_id: null,
        })
      ).rejects.toThrow(InvalidAuditContextError);

      await prisma.conversation.delete({ where: { id: conversation.id } });
    });
  });
});
