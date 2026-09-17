import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuditController } from '@/controllers/audit.controller.js';
import { MetricsType } from '@/types/audit.js';

describe('AuditController', () => {
  let auditController: AuditController;
  let mockAuditService: any;

  beforeEach(() => {
    // Mock the AuditService
    mockAuditService = {
      getJobAuditLogs: vi.fn(),
      getConversationAuditLogs: vi.fn(),
    };

    auditController = new AuditController(mockAuditService as any);
  });

  describe('getJobAuditLogs', () => {
    it('should return audit logs for a valid job ID', async () => {
      const mockLogs = [{ id: '1', job_id: 'job-1' }];
      mockAuditService.getJobAuditLogs.mockResolvedValue(mockLogs);

      const mockReq = {
        params: { id: 'job-1' },
        query: {},
      } as any;
      const mockRes = {
        json: vi.fn().mockReturnThis(),
        status: vi.fn().mockReturnThis(),
      } as any;
      const mockNext = vi.fn();

      await auditController.getJobAuditLogs(mockReq, mockRes, mockNext);

      expect(mockAuditService.getJobAuditLogs).toHaveBeenCalledWith('job-1', {});
      expect(mockRes.json).toHaveBeenCalledWith(mockLogs);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should pass query parameters to service', async () => {
      const mockLogs = [{ id: '1', job_id: 'job-1' }];
      mockAuditService.getJobAuditLogs.mockResolvedValue(mockLogs);

      const mockReq = {
        params: { id: 'job-1' },
        query: { metricsType: 'PERFORMANCE', limit: '10', offset: '0' },
      } as any;
      const mockRes = {
        json: vi.fn().mockReturnThis(),
        status: vi.fn().mockReturnThis(),
      } as any;
      const mockNext = vi.fn();

      await auditController.getJobAuditLogs(mockReq, mockRes, mockNext);

      expect(mockAuditService.getJobAuditLogs).toHaveBeenCalledWith('job-1', {
        metricsType: MetricsType.PERFORMANCE,
        limit: 10,
        offset: 0,
      });
      expect(mockRes.json).toHaveBeenCalledWith(mockLogs);
    });

    it('should return 400 when job ID is missing', async () => {
      const mockReq = {
        params: {},
        query: {},
      } as any;
      const mockRes = {
        json: vi.fn().mockReturnThis(),
        status: vi.fn().mockReturnThis(),
      } as any;
      const mockNext = vi.fn();

      await auditController.getJobAuditLogs(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Job ID is required' });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should handle service errors', async () => {
      const error = new Error('Service error');
      mockAuditService.getJobAuditLogs.mockRejectedValue(error);

      const mockReq = {
        params: { id: 'job-1' },
        query: {},
      } as any;
      const mockRes = {
        json: vi.fn().mockReturnThis(),
        status: vi.fn().mockReturnThis(),
      } as any;
      const mockNext = vi.fn();

      await auditController.getJobAuditLogs(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith(error);
    });

    it('should handle array job IDs', async () => {
      const mockLogs = [{ id: '1', job_id: 'job-1' }];
      mockAuditService.getJobAuditLogs.mockResolvedValue(mockLogs);

      const mockReq = {
        params: { id: ['job-1', 'job-2'] },
        query: {},
      } as any;
      const mockRes = {
        json: vi.fn().mockReturnThis(),
        status: vi.fn().mockReturnThis(),
      } as any;
      const mockNext = vi.fn();

      await auditController.getJobAuditLogs(mockReq, mockRes, mockNext);

      expect(mockAuditService.getJobAuditLogs).toHaveBeenCalledWith('job-1', {});
    });
  });

  describe('getConversationAuditLogs', () => {
    it('should return audit logs for a valid conversation ID', async () => {
      const mockLogs = [{ id: '1', conversation_id: 'conv-1' }];
      mockAuditService.getConversationAuditLogs.mockResolvedValue(mockLogs);

      const mockReq = {
        params: { id: 'conv-1' },
        query: {},
      } as any;
      const mockRes = {
        json: vi.fn().mockReturnThis(),
        status: vi.fn().mockReturnThis(),
      } as any;
      const mockNext = vi.fn();

      await auditController.getConversationAuditLogs(mockReq, mockRes, mockNext);

      expect(mockAuditService.getConversationAuditLogs).toHaveBeenCalledWith('conv-1', {});
      expect(mockRes.json).toHaveBeenCalledWith(mockLogs);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should pass query parameters to service', async () => {
      const mockLogs = [{ id: '1', conversation_id: 'conv-1' }];
      mockAuditService.getConversationAuditLogs.mockResolvedValue(mockLogs);

      const mockReq = {
        params: { id: 'conv-1' },
        query: { metricsType: 'COST', limit: '10', offset: '0' },
      } as any;
      const mockRes = {
        json: vi.fn().mockReturnThis(),
        status: vi.fn().mockReturnThis(),
      } as any;
      const mockNext = vi.fn();

      await auditController.getConversationAuditLogs(mockReq, mockRes, mockNext);

      expect(mockAuditService.getConversationAuditLogs).toHaveBeenCalledWith('conv-1', {
        metricsType: MetricsType.COST,
        limit: 10,
        offset: 0,
      });
      expect(mockRes.json).toHaveBeenCalledWith(mockLogs);
    });

    it('should return 400 when conversation ID is missing', async () => {
      const mockReq = {
        params: {},
        query: {},
      } as any;
      const mockRes = {
        json: vi.fn().mockReturnThis(),
        status: vi.fn().mockReturnThis(),
      } as any;
      const mockNext = vi.fn();

      await auditController.getConversationAuditLogs(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Conversation ID is required' });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should handle service errors', async () => {
      const error = new Error('Service error');
      mockAuditService.getConversationAuditLogs.mockRejectedValue(error);

      const mockReq = {
        params: { id: 'conv-1' },
        query: {},
      } as any;
      const mockRes = {
        json: vi.fn().mockReturnThis(),
        status: vi.fn().mockReturnThis(),
      } as any;
      const mockNext = vi.fn();

      await auditController.getConversationAuditLogs(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith(error);
    });

    it('should handle array conversation IDs', async () => {
      const mockLogs = [{ id: '1', conversation_id: 'conv-1' }];
      mockAuditService.getConversationAuditLogs.mockResolvedValue(mockLogs);

      const mockReq = {
        params: { id: ['conv-1', 'conv-2'] },
        query: {},
      } as any;
      const mockRes = {
        json: vi.fn().mockReturnThis(),
        status: vi.fn().mockReturnThis(),
      } as any;
      const mockNext = vi.fn();

      await auditController.getConversationAuditLogs(mockReq, mockRes, mockNext);

      expect(mockAuditService.getConversationAuditLogs).toHaveBeenCalledWith('conv-1', {});
    });
  });
});