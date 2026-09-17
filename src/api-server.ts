/**
 * API Server Entry Point
 *
 * Express-based HTTP server that owns API concerns and creates durable jobs.
 * Does not perform indexing work (that's handled by worker processes).
 *
 * Phase 2: Implements repository and job endpoints.
 * Phase 4 will add conversation/chat endpoints with SSE.
 */
import express from 'express';
import { getServerConfig, getFullAppConfig, type FullAppConfig } from '@/config/index.js';
import { errorHandler } from '@/middlewares/error-handler.middleware.js';
import { notFound } from '@/middlewares/not-found.middleware.js';
import { apiRouter } from '@/routes/index.js';

export class ApiServer {
  private readonly app: express.Application;
  private readonly config: FullAppConfig;

  constructor(config?: FullAppConfig) {
    this.config = config ?? getFullAppConfig();
    this.app = express();

    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  /**
   * Sets up Express middleware.
   */
  private setupMiddleware(): void {
    // Parse JSON bodies
    this.app.use(express.json());

    // Parse URL-encoded bodies
    this.app.use(express.urlencoded({ extended: true }));

    // Request logging middleware
    this.app.use((req, _res, next) => {
      console.log(`[API] ${req.method} ${req.path}`);
      next();
    });
  }

  /**
   * Sets up API routes.
   */
  private setupRoutes(): void {
    // Mount API router with v1 prefix
    this.app.use('/api/v1', apiRouter);
  }

  /**
   * Sets up error handling middleware.
   */
  private setupErrorHandling(): void {
    // 404 handler
    this.app.use(notFound);

    // Global error handler
    this.app.use(errorHandler);
  }

  /**
   * Starts the API server.
   */
  async start(): Promise<void> {
    const appConfig = getServerConfig(this.config);
    const port = appConfig.server.port;
    const nodeEnv = appConfig.server.nodeEnv;

    return new Promise((resolve, reject) => {
      try {
        this.app.listen(port, () => {
          console.log(`[API] Server started on port ${port}`);
          console.log(`[API] Environment: ${nodeEnv}`);
          resolve();
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Gets the Express app instance (useful for testing).
   */
  getApp(): express.Application {
    return this.app;
  }
}

// Main entry point
async function main() {
  const server = new ApiServer();

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('Received SIGINT, shutting down API server...');
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.log('Received SIGTERM, shutting down API server...');
    process.exit(0);
  });

  // Start server
  await server.start();

  console.log('API server running. Press Ctrl+C to stop.');
}

// Only run main if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('API server failed to start:', error);
    process.exit(1);
  });
}
