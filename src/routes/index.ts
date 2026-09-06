import { Router } from 'express';
import healthRoutes from '@/routes/health.routes.js';

export const apiRouter = Router();

// Mount health routes
apiRouter.use('/', healthRoutes);
