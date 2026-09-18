import { Router } from 'express';
import healthRoutes from '@/routes/health.routes.js';
import { repositoryRoutes } from '@/routes/repository.routes.js';
import { jobRoutes } from '@/routes/job.routes.js';
import { conversationRoutes } from '@/routes/conversation.routes.js';
// import { auditRoutes } from '@/routes/audit.routes.js';

export const apiRouter = Router();

// Mount health routes
apiRouter.use('/health', healthRoutes);

// Mount repository routes
apiRouter.use('/repositories', repositoryRoutes);

// Mount job routes
apiRouter.use('/jobs', jobRoutes);

// Mount conversation routes
apiRouter.use('/conversations', conversationRoutes);

// WIP
// apiRouter.use('/audit', auditRoutes);
