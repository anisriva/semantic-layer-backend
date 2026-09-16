/**
 * Application configuration Zod schemas
 * Provides runtime validation for app.yaml configuration
 * Exports inferred types from schemas
 */

import { z } from 'zod';

export const serverConfigSchema = z.object({
  port: z.number().int().positive(),
  nodeEnv: z.string(),
});

export const workerConfigSchema = z.object({
  pollIntervalMs: z.number().int().positive(),
  heartbeatIntervalMs: z.number().int().positive(),
  staleAfterMs: z.number().int().positive(),
  maxRetries: z.number().int().positive(),
});

export const qdrantConfigSchema = z.object({
  url: z.string().url(),
  collectionPrefix: z.string(),
});

export const postgresConfigSchema = z.object({
  connectionString: z.string(),
});

export const ragDbConfigSchema = z.object({
  qdrant: qdrantConfigSchema,
});

export const appDbConfigSchema = z.object({
  postgres: postgresConfigSchema,
});

export const appConfigSchema = z.object({
  server: serverConfigSchema,
  worker: workerConfigSchema,
  ragDb: ragDbConfigSchema,
  appDb: appDbConfigSchema,
});

export const embeddingModelConfigSchema = z.object({
  baseUrl: z.string().url(),
  apiKey: z.string().optional(),
  model: z.string().min(1),
  dimensions: z.number().int().positive(),
});

export const oauth2ConfigSchema = z.object({
  oauthUrl: z.string().url(),
  clientId: z.string(),
  clientSecret: z.string(),
}).optional();

export const llmModelConfigSchema = z.object({
  baseUrl: z.string().url(),
  apiKey: z.string().optional(),
  model: z.string().min(1),
  maxRetries: z.number().int().positive(),
  retryDelayMs: z.number().int().positive(),
  timeout: z.number().int().positive(),
  oauth2: oauth2ConfigSchema.optional(),
});

export const modelsConfigSchema = z.object({
  embedding: embeddingModelConfigSchema,
  enrichment: llmModelConfigSchema,
  answer: llmModelConfigSchema,
});

export const ingestionConfigSchema = z.object({
  maxTokensPerChunk: z.number().int().positive(),
  concurrency: z.number().int().positive().default(4),
  enrichmentConcurrency: z.number().int().positive().default(2),
  embeddingConcurrency: z.number().int().positive().default(2),
  excludePatterns: z.array(z.string()),
});

export const retrievalConfigSchema = z.object({
  topK: z.number().int().positive(),
  vectorWeight: z.number().min(0).max(1),
  bm25Weight: z.number().min(0).max(1),
});

export const ragPipelineConfigSchema = z.object({
  ingestion: ingestionConfigSchema,
  retrieval: retrievalConfigSchema,
});

export const fullAppConfigSchema = z.object({
  app: appConfigSchema,
  models: modelsConfigSchema,
  ragPipeline: ragPipelineConfigSchema,
});

// Export inferred types from schemas
export type ServerConfig = z.infer<typeof serverConfigSchema>;
export type WorkerConfig = z.infer<typeof workerConfigSchema>;
export type QdrantConfig = z.infer<typeof qdrantConfigSchema>;
export type PostgresConfig = z.infer<typeof postgresConfigSchema>;
export type RagDbConfig = z.infer<typeof ragDbConfigSchema>;
export type AppDbConfig = z.infer<typeof appDbConfigSchema>;
export type AppConfig = z.infer<typeof appConfigSchema>;
export type EmbeddingModelConfig = z.infer<typeof embeddingModelConfigSchema>;
export type OAuth2Config = z.infer<typeof oauth2ConfigSchema>;
export type LlmModelConfig = z.infer<typeof llmModelConfigSchema>;
export type ModelsConfig = z.infer<typeof modelsConfigSchema>;
export type IngestionConfig = z.infer<typeof ingestionConfigSchema>;
export type RetrievalConfig = z.infer<typeof retrievalConfigSchema>;
export type RagPipelineConfig = z.infer<typeof ragPipelineConfigSchema>;
export type FullAppConfig = z.infer<typeof fullAppConfigSchema>;