import { getPostgresConfig, getFullAppConfig } from '@/config/index.js';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

// Get connection string from our config manager
const postgresConfig = getPostgresConfig(getFullAppConfig());
const connectionString = postgresConfig.connectionString;

if (!connectionString) {
  throw new Error('DATABASE_URL is not defined in configuration.');
}

const adapter = new PrismaPg({ connectionString });

// Prisma singleton to avoid exhausting DB connections in dev
const globalForPrisma = global as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
  });

// Only set the global in non-production environments
if (getFullAppConfig().app.server.nodeEnv !== 'production') {
  globalForPrisma.prisma = prisma;
}
