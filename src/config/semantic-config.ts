/**
 * Model-agnostic semantic configuration for Semantic Layer
 * 
 * This configuration uses environment variables to support any OpenAI-compatible
 * embedding and LLM provider (Ollama, OpenAI, etc.) without code changes.
 */

import { z } from 'zod';

// --- Environment Variable Schema ---

const semanticConfigSchema = z.object({
  // Embedding Configuration
  EMBEDDING_BASE_URL: z.string().url().default('http://localhost:11434/v1'),
  EMBEDDING_API_KEY: z.string().optional(),
  EMBEDDING_MODEL: z.string().min(1).default('nomic-embed-text'),
  EMBEDDING_DIMENSIONS: z.coerce.number().int().positive().default(768),
  
  // LLM Configuration (for enrichment/chat)
  LLM_BASE_URL: z.string().url().default('http://localhost:11434/v1'),
  LLM_API_KEY: z.string().optional(),
  LLM_MODEL: z.string().min(1).default('qwen2.5-coder:7b-instruct'),
  
  // Storage Configuration
  QDRANT_URL: z.string().url().default('http://localhost:6333'),
  QDRANT_API_KEY: z.string().optional(),
  QDRANT_COLLECTION_PREFIX: z.string().default('semantic-layer'),
  
  // Ingestion Configuration
  MAX_TOKENS_PER_CHUNK: z.coerce.number().int().positive().default(512),
  EXCLUDE_PATTERNS: z.string().default('node_modules,dist,.git,coverage'),
  
  // Search Configuration
  SEARCH_TOP_K: z.coerce.number().int().positive().default(10),
  SEARCH_VECTOR_WEIGHT: z.coerce.number().min(0).max(1).default(0.7),
  SEARCH_BM25_WEIGHT: z.coerce.number().min(0).max(1).default(0.3),
});

export type SemanticConfig = z.infer<typeof semanticConfigSchema>;

// --- Configuration Loading ---

class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

/**
 * Load and validate semantic configuration from environment variables
 */
export function loadSemanticConfig(): SemanticConfig {
  try {
    const config = semanticConfigSchema.parse(process.env);
    return config;
  } catch (error) {
    if (error instanceof z.ZodError) {
      const messages = error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join(', ');
      throw new ConfigError(`Invalid semantic configuration: ${messages}`);
    }
    throw new ConfigError(`Failed to load semantic configuration: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Get embedding provider configuration (OpenAI-compatible format)
 */
export function getEmbeddingProviderConfig(config: SemanticConfig) {
  return {
    baseUrl: config.EMBEDDING_BASE_URL,
    apiKey: config.EMBEDDING_API_KEY,
    model: config.EMBEDDING_MODEL,
    dimensions: config.EMBEDDING_DIMENSIONS,
  };
}

/**
 * Get LLM provider configuration (OpenAI-compatible format)
 */
export function getLLMProviderConfig(config: SemanticConfig) {
  return {
    baseUrl: config.LLM_BASE_URL,
    apiKey: config.LLM_API_KEY,
    model: config.LLM_MODEL,
  };
}

/**
 * Get Qdrant storage configuration
 */
export function getQdrantConfig(config: SemanticConfig) {
  return {
    url: config.QDRANT_URL,
    apiKey: config.QDRANT_API_KEY,
    collectionPrefix: config.QDRANT_COLLECTION_PREFIX,
  };
}

/**
 * Get ingestion configuration
 */
export function getIngestionConfig(config: SemanticConfig) {
  return {
    maxTokensPerChunk: config.MAX_TOKENS_PER_CHUNK,
    excludePatterns: config.EXCLUDE_PATTERNS.split(',').map(p => p.trim()),
  };
}

/**
 * Get search configuration
 */
export function getSearchConfig(config: SemanticConfig) {
  return {
    topK: config.SEARCH_TOP_K,
    vectorWeight: config.SEARCH_VECTOR_WEIGHT,
    bm25Weight: config.SEARCH_BM25_WEIGHT,
  };
}