import express from 'express';
import { apiRouter } from '@/routes/index.js';
import { notFoundHandler } from '@/middlewares/not-found.middleware.js';
import { errorHandler } from '@/middlewares/error-handler.middleware.js';

export function createApp(): express.Express {
  const app = express();

  // Global middleware
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Mount routes
  app.use('/', apiRouter);

  // Error handling middleware (must be registered last)
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
