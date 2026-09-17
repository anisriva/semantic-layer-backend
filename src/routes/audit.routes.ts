import { Router } from 'express';
import { AuditController } from '@/controllers/audit.controller.js';

const router = Router();
const auditController = new AuditController();

// Job audit routes
// GET /api/v1/audit/:id/jobs - Get audit logs for a job
router.get('/audit/:id/jobs', auditController.getJobAuditLogs.bind(auditController));

// Conversation audit routes
// GET /api/v1/audit/:id/conversations - Get audit logs for a conversation
router.get('/audit/:id/conversations', auditController.getConversationAuditLogs.bind(auditController));

export { router as auditRoutes };
