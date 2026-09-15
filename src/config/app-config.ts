/**
 * Application configuration loading
 * Loads and validates environment variables with app.yaml fallback
 * ENV variables take precedence over YAML values
 */

import { getConfigValue } from '@/utils/env-loader.js';
import { fullAppConfigSchema, type FullAppConfig, type AppConfig, type ModelsConfig, type RagPipelineConfig, type EmbeddingModelConfig, type LlmModelConfig, type IngestionConfig, type RetrievalConfig, type WorkerConfig, type QdrantConfig, type PostgresConfig } from '@/types/config/app-config.schema.js';

let cachedConfig: FullAppConfig | null = null;

/**
 * Get full application configuration with ENV > YAML precedence
 * Caches the result for performance
 */
export function getFullAppConfig(forceReload = false): FullAppConfig {
  if (cachedConfig && !forceReload) {
    return cachedConfig;
  }

  const config: FullAppConfig = {
    app: {
      server: {
        port: getConfigValue('app.server.port', 3000) as number,
        nodeEnv: getConfigValue('app.server.nodeEnv', 'development') as string,
      },
      worker: {
        pollIntervalMs: getConfigValue('app.worker.pollIntervalMs', 5000) as number,
        heartbeatIntervalMs: getConfigValue('app.worker.heartbeatIntervalMs', 30000) as number,
        staleAfterMs: getConfigValue('app.worker.staleAfterMs', 300000) as number,
        maxRetries: getConfigValue('app.worker.maxRetries', 3) as number,
      },
      ragDb: {
        qdrant: {
          url: getConfigValue('app.ragDb.qdrant.url', 'http://localhost:6333') as string,
          collectionPrefix: getConfigValue('app.ragDb.qdrant.collectionPrefix', 'semantic-layer') as string,
        },
      },
      appDb: {
        postgres: {
          connectionString: getConfigValue('app.appDb.postgres.connectionString', '') as string,
        },
      },
    },
    models: {
      embedding: {
        baseUrl: getConfigValue('models.embedding.baseUrl', 'http://localhost:11434/v1') as string,
        apiKey: getConfigValue('models.embedding.apiKey', '') as string,
        model: getConfigValue('models.embedding.model', 'nomic-embed-text') as string,
        dimensions: getConfigValue('models.embedding.dimensions', 768) as number,
      },
      enrichment: {
        baseUrl: getConfigValue('models.enrichment.baseUrl', 'http://localhost:11434/v1') as string,
        apiKey: getConfigValue('models.enrichment.apiKey', '') as string,
        model: getConfigValue('models.enrichment.model', 'qwen2.5-coder:7b-instruct') as string,
        maxRetries: getConfigValue('models.enrichment.maxRetries', 2) as number,
        retryDelayMs: getConfigValue('models.enrichment.retryDelayMs', 1000) as number,
        timeout: getConfigValue('models.enrichment.timeout', 120000) as number,
      },
      answer: {
        baseUrl: getConfigValue('models.answer.baseUrl', 'http://localhost:11434/v1') as string,
        apiKey: getConfigValue('models.answer.apiKey', '') as string,
        model: getConfigValue('models.answer.model', 'qwen2.5-coder:7b-instruct') as string,
        maxRetries: getConfigValue('models.answer.maxRetries', 2) as number,
        retryDelayMs: getConfigValue('models.answer.retryDelayMs', 1000) as number,
        timeout: getConfigValue('models.answer.timeout', 120000) as number,
      },
    },
    ragPipeline: {
      ingestion: {
        maxTokensPerChunk: getConfigValue('ragPipeline.ingestion.maxTokensPerChunk', 512) as number,
        excludePatterns: getConfigValue('ragPipeline.ingestion.excludePatterns', ['node_modules', 'dist', '.git', 'coverage']) as string[],
      },
      retrieval: {
        topK: getConfigValue('ragPipeline.retrieval.topK', 10) as number,
        vectorWeight: getConfigValue('ragPipeline.retrieval.vectorWeight', 0.7) as number,
        bm25Weight: getConfigValue('ragPipeline.retrieval.bm25Weight', 0.3) as number,
      },
    },
  };

  cachedConfig = config;
  return config;
}

/**
 * Validate YAML configuration against schema
 */
export function validateAppConfig(config: unknown): FullAppConfig {
  return fullAppConfigSchema.parse(config);
}

// Configuration getter functions for backward compatibility
export function getServerConfig(fullConfig: FullAppConfig): AppConfig {
  return fullConfig.app;
}

export function getModelsConfig(fullConfig: FullAppConfig): ModelsConfig {
  return fullConfig.models;
}

export function getRagPipelineConfig(fullConfig: FullAppConfig): RagPipelineConfig {
  return fullConfig.ragPipeline;
}

export function getEmbeddingModelConfig(fullConfig: FullAppConfig): EmbeddingModelConfig {
  return fullConfig.models.embedding;
}

export function getEnrichmentModelConfig(fullConfig: FullAppConfig): LlmModelConfig {
  return fullConfig.models.enrichment;
}

export function getAnswerModelConfig(fullConfig: FullAppConfig): LlmModelConfig {
  return fullConfig.models.answer;
}

export function getIngestionConfig(fullConfig: FullAppConfig): IngestionConfig {
  return fullConfig.ragPipeline.ingestion;
}

export function getRetrievalConfig(fullConfig: FullAppConfig): RetrievalConfig {
  return fullConfig.ragPipeline.retrieval;
}

export function getWorkerConfig(fullConfig: FullAppConfig): WorkerConfig {
  return fullConfig.app.worker;
}

export function getQdrantConfig(fullConfig: FullAppConfig): QdrantConfig {
  return fullConfig.app.ragDb.qdrant;
}

export function getPostgresConfig(fullConfig: FullAppConfig): PostgresConfig {
  return fullConfig.app.appDb.postgres;
}