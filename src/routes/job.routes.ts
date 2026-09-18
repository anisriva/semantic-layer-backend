import { Router } from "express";
import { JobController } from "@/controllers/job.controller.js";
import { AuditController } from "@/controllers/audit.controller.js";

const router = Router();
const jobController = new JobController();
const auditController = new AuditController();

// GET /api/v1/jobs/:id - Get a specific job
router.get("/:id", jobController.getJob.bind(jobController));

// GET /api/v1/jobs/:id/logs - Stream raw log lines for a job (SSE)
router.get("/:id/logs", jobController.streamJobLogs.bind(jobController));

// Job audit routes
// GET /api/v1/jobs/:id/audit - Get audit logs for a job
router.get("/:id/audit", auditController.getJobAuditLogs.bind(auditController));

// Job audit streaming
// GET /api/v1/jobs/:id/audit/stream - Stream audit logs for job-related stages (SSE)
router.get(
  "/:id/audit/stream",
  auditController.streamJobAuditLogs.bind(auditController),
);

export { router as jobRoutes };
