/**
 * Application configuration loading
 * Loads and validates environment variables with app.yaml fallback
 * ENV variables take precedence over YAML values
 */

import { loadAppConfig } from '@/utils/yaml-loader.js';
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

  const yamlConfig = loadAppConfig() as FullAppConfig;
  const envPath = '.env';
  
  const config: FullAppConfig = {
    app: {
      server: {
        port: getConfigValue(envPath, yamlConfig, 'app.server.port', 3000) as number,
        nodeEnv: getConfigValue(envPath, yamlConfig, 'app.server.nodeEnv', 'development') as string,
      },
      worker: {
        pollIntervalMs: getConfigValue(envPath, yamlConfig, 'app.worker.pollIntervalMs', 5000) as number,
        heartbeatIntervalMs: getConfigValue(envPath, yamlConfig, 'app.worker.heartbeatIntervalMs', 30000) as number,
        staleAfterMs: getConfigValue(envPath, yamlConfig, 'app.worker.staleAfterMs', 300000) as number,
        maxRetries: getConfigValue(envPath, yamlConfig, 'app.worker.maxRetries', 3) as number,
      },
      ragDb: {
        qdrant: {
          url: getConfigValue(envPath, yamlConfig, 'app.ragDb.qdrant.url', 'http://localhost:6333') as string,
          collectionPrefix: getConfigValue(envPath, yamlConfig, 'app.ragDb.qdrant.collectionPrefix', 'semantic-layer') as string,
        },
      },
      appDb: {
        postgres: {
          host: getConfigValue(envPath, yamlConfig, 'app.appDb.postgres.host', 'localhost') as string,
          port: getConfigValue(envPath, yamlConfig, 'app.appDb.postgres.port', 5432) as number,
          database: getConfigValue(envPath, yamlConfig, 'app.appDb.postgres.database', 'semantic_layer') as string,
          user: getConfigValue(envPath, yamlConfig, 'app.appDb.postgres.user', 'semantic_layer') as string,
          password: process.env.POSTGRES_PASSWORD as string,
        },
      },
    },
    models: {
      embedding: {
        baseUrl: getConfigValue(envPath, yamlConfig, 'models.embedding.baseUrl', 'http://localhost:11434/v1') as string,
        apiKey: getConfigValue(envPath, yamlConfig, 'models.embedding.apiKey', '') as string,
        model: getConfigValue(envPath, yamlConfig, 'models.embedding.model', 'nomic-embed-text') as string,
        dimensions: getConfigValue(envPath, yamlConfig, 'models.embedding.dimensions', 768) as number,
      },
      enrichment: {
        baseUrl: getConfigValue(envPath, yamlConfig, 'models.enrichment.baseUrl', 'http://localhost:11434/v1') as string,
        apiKey: getConfigValue(envPath, yamlConfig, 'models.enrichment.apiKey', '') as string,
        model: getConfigValue(envPath, yamlConfig, 'models.enrichment.model', 'qwen2.5-coder:7b-instruct') as string,
        maxRetries: getConfigValue(envPath, yamlConfig, 'models.enrichment.maxRetries', 2) as number,
        retryDelayMs: getConfigValue(envPath, yamlConfig, 'models.enrichment.retryDelayMs', 1000) as number,
        timeout: getConfigValue(envPath, yamlConfig, 'models.enrichment.timeout', 120000) as number,
      },
      answer: {
        baseUrl: getConfigValue(envPath, yamlConfig, 'models.answer.baseUrl', 'http://localhost:11434/v1') as string,
        apiKey: getConfigValue(envPath, yamlConfig, 'models.answer.apiKey', '') as string,
        model: getConfigValue(envPath, yamlConfig, 'models.answer.model', 'qwen2.5-coder:7b-instruct') as string,
        maxRetries: getConfigValue(envPath, yamlConfig, 'models.answer.maxRetries', 2) as number,
        retryDelayMs: getConfigValue(envPath, yamlConfig, 'models.answer.retryDelayMs', 1000) as number,
        timeout: getConfigValue(envPath, yamlConfig, 'models.answer.timeout', 120000) as number,
      },
    },
    ragPipeline: {
      ingestion: {
        maxTokensPerChunk: getConfigValue(envPath, yamlConfig, 'ragPipeline.ingestion.maxTokensPerChunk', 512) as number,
        excludePatterns: getConfigValue(envPath, yamlConfig, 'ragPipeline.ingestion.excludePatterns', ['node_modules', 'dist', '.git', 'coverage']) as string[],
      },
      retrieval: {
        topK: getConfigValue(envPath, yamlConfig, 'ragPipeline.retrieval.topK', 10) as number,
        vectorWeight: getConfigValue(envPath, yamlConfig, 'ragPipeline.retrieval.vectorWeight', 0.7) as number,
        bm25Weight: getConfigValue(envPath, yamlConfig, 'ragPipeline.retrieval.bm25Weight', 0.3) as number,
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