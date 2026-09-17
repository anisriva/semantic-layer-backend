import { Router } from 'express';
import { JobController } from '@/controllers/job.controller.js';

const router = Router();
const jobController = new JobController();

// GET /api/v1/jobs/:id - Get a specific job
router.get('/:id', jobController.getJob.bind(jobController));

// GET /api/v1/jobs/:id/audit - Get audit logs for a job
router.get('/:id/audit', jobController.getJobAuditLogs.bind(jobController));

// GET /api/v1/jobs/:id/logs - Stream raw log lines for a job (SSE)
router.get('/:id/logs', jobController.streamJobLogs.bind(jobController));

export { router as jobRoutes };
