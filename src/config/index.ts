/**
 * Main configuration export
 * Aggregates all configuration modules
 */

// Application configuration
export { 
  validateAppConfig, 
  getFullAppConfig,
  getServerConfig,
  getModelsConfig,
  getRagPipelineConfig,
  getEmbeddingModelConfig,
  getEnrichmentModelConfig,
  getAnswerModelConfig,
  getIngestionConfig,
  getRetrievalConfig,
  getWorkerConfig,
  getQdrantConfig,
  getPostgresConfig,
} from './app-config.js';

// Prompts configuration
export { renderTemplate, getPromptsConfig, renderPrompt } from './prompts-config.js';

// Types (inferred from Zod schemas)
export type { 
  FullAppConfig, 
  AppConfig, 
  ModelsConfig, 
  RagPipelineConfig,
  EmbeddingModelConfig,
  LlmModelConfig,
  IngestionConfig, 
  RetrievalConfig, 
  WorkerConfig,
  QdrantConfig,
  PostgresConfig
} from '@/types/config/app-config.schema.js';

export type { 
  PromptsConfig, 
  EnrichmentPrompts, 
  AnswerPrompts, 
  ContextPrompts 
} from '@/types/config/prompts-config.schema.js';