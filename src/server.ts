import http from 'http';
import { getFullAppConfig } from '@/config/index.js';
import { createApp } from '@/app.js';

const fullConfig = getFullAppConfig();
const app = createApp();
const server = http.createServer(app);

// Start the server
server.listen(fullConfig.app.server.port, () => {
  console.log(`🚀 Server running on port ${fullConfig.app.server.port}`);
  console.log(`🔗 Health check: http://localhost:${fullConfig.app.server.port}/health`);
});

// Graceful shutdown
const gracefulShutdown = (signal: string) => {
  console.log(`\n${signal} received. Starting graceful shutdown...`);

  server.close(() => {
    console.log('✅ Server closed successfully');
    process.exit(0);
  });

  // Force close after 10 seconds
  setTimeout(() => {
    console.error('❌ Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
};

// Handle shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught errors
process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});
