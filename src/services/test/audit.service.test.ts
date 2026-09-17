import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuditService } from '@/services/audit.js';
import { MetricsType } from '@/types/audit.js';

describe('AuditService', () => {
  let auditService: AuditService;
  let mockAuditLogDao: any;

  beforeEach(() => {
    // Mock the AuditLogDao
    mockAuditLogDao = {
      findByJob: vi.fn(),
      findByJobAndMetricsType: vi.fn(),
      findByConversation: vi.fn(),
      findByConversationAndMetricsType: vi.fn(),
    };

    auditService = new AuditService(mockAuditLogDao as any);
  });

  describe('getJobAuditLogs', () => {
    it('should call findByJob when no metrics type is specified', async () => {
      const mockLogs = [{ id: '1', job_id: 'job-1' }];
      mockAuditLogDao.findByJob.mockResolvedValue(mockLogs);

      const result = await auditService.getJobAuditLogs('job-1');

      expect(mockAuditLogDao.findByJob).toHaveBeenCalledWith('job-1', {});
      expect(result).toEqual(mockLogs);
    });

    it('should call findByJobAndMetricsType when metrics type is specified', async () => {
      const mockLogs = [{ id: '1', job_id: 'job-1', metrics_type: MetricsType.PERFORMANCE }];
      mockAuditLogDao.findByJobAndMetricsType.mockResolvedValue(mockLogs);

      const result = await auditService.getJobAuditLogs('job-1', { metricsType: MetricsType.PERFORMANCE });

      expect(mockAuditLogDao.findByJobAndMetricsType).toHaveBeenCalledWith('job-1', MetricsType.PERFORMANCE, {});
      expect(result).toEqual(mockLogs);
    });

    it('should pass pagination options to DAO methods', async () => {
      const mockLogs = [{ id: '1', job_id: 'job-1' }];
      mockAuditLogDao.findByJob.mockResolvedValue(mockLogs);

      const result = await auditService.getJobAuditLogs('job-1', { limit: 10, offset: 5 });

      expect(mockAuditLogDao.findByJob).toHaveBeenCalledWith('job-1', { limit: 10, offset: 5 });
      expect(result).toEqual(mockLogs);
    });

    it('should handle empty options', async () => {
      const mockLogs = [{ id: '1', job_id: 'job-1' }];
      mockAuditLogDao.findByJob.mockResolvedValue(mockLogs);

      const result = await auditService.getJobAuditLogs('job-1', {});

      expect(mockAuditLogDao.findByJob).toHaveBeenCalledWith('job-1', {});
      expect(result).toEqual(mockLogs);
    });
  });

  describe('getConversationAuditLogs', () => {
    it('should call findByConversation when no metrics type is specified', async () => {
      const mockLogs = [{ id: '1', conversation_id: 'conv-1' }];
      mockAuditLogDao.findByConversation.mockResolvedValue(mockLogs);

      const result = await auditService.getConversationAuditLogs('conv-1');

      expect(mockAuditLogDao.findByConversation).toHaveBeenCalledWith('conv-1', {});
      expect(result).toEqual(mockLogs);
    });

    it('should call findByConversationAndMetricsType when metrics type is specified', async () => {
      const mockLogs = [{ id: '1', conversation_id: 'conv-1', metrics_type: MetricsType.COST }];
      mockAuditLogDao.findByConversationAndMetricsType.mockResolvedValue(mockLogs);

      const result = await auditService.getConversationAuditLogs('conv-1', { metricsType: MetricsType.COST });

      expect(mockAuditLogDao.findByConversationAndMetricsType).toHaveBeenCalledWith('conv-1', MetricsType.COST, {});
      expect(result).toEqual(mockLogs);
    });

    it('should pass pagination options to DAO methods', async () => {
      const mockLogs = [{ id: '1', conversation_id: 'conv-1' }];
      mockAuditLogDao.findByConversation.mockResolvedValue(mockLogs);

      const result = await auditService.getConversationAuditLogs('conv-1', { limit: 10, offset: 5 });

      expect(mockAuditLogDao.findByConversation).toHaveBeenCalledWith('conv-1', { limit: 10, offset: 5 });
      expect(result).toEqual(mockLogs);
    });

    it('should handle empty options', async () => {
      const mockLogs = [{ id: '1', conversation_id: 'conv-1' }];
      mockAuditLogDao.findByConversation.mockResolvedValue(mockLogs);

      const result = await auditService.getConversationAuditLogs('conv-1', {});

      expect(mockAuditLogDao.findByConversation).toHaveBeenCalledWith('conv-1', {});
      expect(result).toEqual(mockLogs);
    });
  });

  describe('AuditLogQueryOptions', () => {
    it('should handle all query options', async () => {
      const mockLogs = [{ id: '1', job_id: 'job-1', metrics_type: MetricsType.PERFORMANCE }];
      mockAuditLogDao.findByJobAndMetricsType.mockResolvedValue(mockLogs);

      const result = await auditService.getJobAuditLogs('job-1', {
        metricsType: MetricsType.PERFORMANCE,
        limit: 5,
        offset: 0,
      });

      expect(mockAuditLogDao.findByJobAndMetricsType).toHaveBeenCalledWith('job-1', MetricsType.PERFORMANCE, { limit: 5, offset: 0 });
      expect(result).toEqual(mockLogs);
    });

    it('should handle partial query options', async () => {
      const mockLogs = [{ id: '1', job_id: 'job-1' }];
      mockAuditLogDao.findByJob.mockResolvedValue(mockLogs);

      const result = await auditService.getJobAuditLogs('job-1', { limit: 10 });

      expect(mockAuditLogDao.findByJob).toHaveBeenCalledWith('job-1', { limit: 10 });
      expect(result).toEqual(mockLogs);
    });
  });
});