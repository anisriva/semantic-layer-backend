/**
 * Service: SearchService
 *
 * Validates a retrieval scope (a Qdrant collection name) and executes
 * hybrid retrieval against it, returning structured results for internal
 * use or a future search API. Phase 1: no repository-scope validation
 * against a DAO yet (see Phase 2 notes in
 * `artifacts/new/1-architecture-and-setup.md`).
 */
import {
  getFullAppConfig,
  getRetrievalConfig,
  getEmbeddingModelConfig,
  type FullAppConfig,
} from '@/config/index.js';
import { HybridSearch, type SearchResult } from '@/helpers/core/index.js';
import { createCollectionProviders } from '@/helpers/provider-factory.js';
import { retrieve } from '@/helpers/hybrid-retriever.js';

export interface SearchOptions {
  topK?: number;
}

/** Thrown when `search` is called against a collection with no indexed points. */
export class NotIndexedError extends Error {
  constructor(collectionName: string) {
    super(`Collection "${collectionName}" has no indexed points`);
    this.name = 'NotIndexedError';
  }
}

/** Thrown when hybrid retrieval itself fails (embedding/vector/BM25 errors). */
export class SearchError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'SearchError';
  }
}

export class SearchService {
  constructor(private readonly fullConfig: FullAppConfig = getFullAppConfig()) {}

  /**
   * Runs `query` through hybrid retrieval against `collectionName`.
   *
   * @throws {NotIndexedError} if the collection has no indexed points.
   * @throws {SearchError} if retrieval fails.
   */
  async search(
    collectionName: string,
    query: string,
    options: SearchOptions = {},
  ): Promise<SearchResult[]> {
    const startedAt = Date.now();
    const topK = options.topK ?? getRetrievalConfig(this.fullConfig).topK;
    const embeddingConfig = getEmbeddingModelConfig(this.fullConfig);
    
    console.log(`[Search] Starting hybrid retrieval for collection "${collectionName}"`);
    console.log(`[Search] Query: "${query}"`);
    console.log(`[Search] Top-K: ${topK}`);
    console.log(`[Search] Embedding model: ${embeddingConfig.model}`);
    console.log(`[Search] Embedding provider: ${embeddingConfig.baseUrl}`);
    
    const retrievalConfig = getRetrievalConfig(this.fullConfig);
    console.log(`[Search] Retrieval weights: vector=${retrievalConfig.vectorWeight}, BM25=${retrievalConfig.bm25Weight}`);

    const { embeddingProvider, vectorStore, bm25Index } = createCollectionProviders(
      collectionName,
      this.fullConfig,
    );

    try {
      console.log('[Search] Checking collection status...');
      const count = await vectorStore.count();
      if (count.isErr()) throw new SearchError('Failed to inspect collection', count.error);
      
      console.log(`[Search] Collection has ${count.value} indexed points`);
      if (count.value === 0) throw new NotIndexedError(collectionName);

      console.log('[Search] Initializing hybrid search...');
      const search = new HybridSearch(
        vectorStore,
        bm25Index,
        embeddingProvider,
        getRetrievalConfig(this.fullConfig),
      );

      try {
        console.log('[Search] Executing hybrid retrieval (vector + BM25)...');
        const results = await retrieve(query, search, topK);
        const duration = Date.now() - startedAt;
        
        console.log(`[Search] Retrieved ${results.length} results in ${duration}ms`);
        results.forEach((result, index) => {
          const filePath = result.chunk?.filePath ?? 'unknown';
          const score = result.score.toFixed(4);
          console.log(`[Search]   [${index + 1}] ${filePath} (score: ${score})`);
        });
        
        return results;
      } catch (error) {
        throw new SearchError('Hybrid retrieval failed', error);
      }
    } finally {
      console.log('[Search] Cleaning up vector store connection...');
      vectorStore.close();
    }
  }
}
