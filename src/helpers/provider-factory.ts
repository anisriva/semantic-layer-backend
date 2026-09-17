/**
 * Pipeline helper: provider-factory
 *
 * The single place that constructs concrete CodeRAG-compatible providers
 * (embedding provider, enrichment/answer LLM providers, Qdrant vector
 * store, BM25 index) from `@/config`. Services must obtain these through
 * this factory instead of calling `new` on core/provider classes directly.
 */
import {
  BM25Index,
  OpenAICompatibleEmbeddingProvider,
  QdrantVectorStore,
  type EmbeddingProvider,
  type LLMProvider,
  type VectorStore,
} from '@/helpers/core/index.js';
import {
  getAnswerModelConfig,
  getEmbeddingModelConfig,
  getEnrichmentModelConfig,
  getFullAppConfig,
  renderPrompt,
  type FullAppConfig,
} from '@/config/index.js';
import { OpenAICompatibleLlm, type StreamingLLMProvider } from '@/connectors/openai-compatible-llm.js';

export interface CollectionProviders {
  bm25Index: BM25Index;
  embeddingProvider: EmbeddingProvider;
  vectorStore: VectorStore;
}

/** Constructs the OpenAI-compatible embedding provider from config. */
export function createEmbeddingProvider(
  fullConfig: FullAppConfig = getFullAppConfig(),
): EmbeddingProvider {
  return new OpenAICompatibleEmbeddingProvider(getEmbeddingModelConfig(fullConfig));
}

/** Constructs the enrichment-role LLM provider from config. */
export function createEnrichmentLlm(
  fullConfig: FullAppConfig = getFullAppConfig(),
): LLMProvider {
  return new OpenAICompatibleLlm(getEnrichmentModelConfig(fullConfig));
}

/**
 * Constructs the answer-role LLM provider from config, with the answer
 * system prompt applied. Typed as `StreamingLLMProvider` (a superset of
 * `LLMProvider`) so `ChatService.askStream` can drive token-by-token SSE
 * responses (Section 14) through the same factory as `ChatService.ask`.
 */
export function createAnswerLlm(
  fullConfig: FullAppConfig = getFullAppConfig(),
): StreamingLLMProvider {
  return new OpenAICompatibleLlm({
    ...getAnswerModelConfig(fullConfig),
    systemPrompt: renderPrompt('answer.systemPrompt', {}),
  });
}

/** Constructs a Qdrant-backed vector store scoped to `collectionName`. */
export function createVectorStore(
  collectionName: string,
  fullConfig: FullAppConfig = getFullAppConfig(),
): VectorStore {
  const embeddingConfig = getEmbeddingModelConfig(fullConfig);
  return new QdrantVectorStore(embeddingConfig.dimensions, {
    collectionName,
    url: fullConfig.app.ragDb.qdrant.url,
  });
}

/** Constructs an in-memory BM25 keyword index. */
export function createBM25Index(): BM25Index {
  return new BM25Index();
}

/**
 * Constructs the embedding provider, vector store, and BM25 index needed to
 * index or search a single Qdrant collection.
 */
export function createCollectionProviders(
  collectionName: string,
  fullConfig: FullAppConfig = getFullAppConfig(),
): CollectionProviders {
  return {
    bm25Index: createBM25Index(),
    embeddingProvider: createEmbeddingProvider(fullConfig),
    vectorStore: createVectorStore(collectionName, fullConfig),
  };
}
