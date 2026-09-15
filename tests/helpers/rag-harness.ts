import {
  getAnswerModelConfig,
  getEmbeddingModelConfig,
  getEnrichmentModelConfig,
  getFullAppConfig,
  getIngestionConfig,
  getRetrievalConfig,
  renderPrompt,
} from '@/config/index.js';
import {
  BM25Index,
  HybridSearch,
  OpenAICompatibleEmbeddingProvider,
  QdrantVectorStore,
  type Chunk,
  type EmbeddingProvider,
  type LLMProvider,
  type ScannedFile,
  type SearchResult,
} from '@/helpers/core/index.js';
import { answerQuestion } from './answer-question.js';
import { buildContext } from './build-context.js';
import { enrichChunks } from './enrich-chunks.js';
import { indexChunks } from './index-chunks.js';
import { log } from './log.js';
import { OpenAICompatibleLlm } from './openai-compatible-llm.js';
import { processFiles } from './process-files.js';
import { retrieve } from './retrieve.js';

export interface RagHarnessResult {
  answer: string;
  chunkIds: string[];
  metrics: {
    chunkCount: number;
    durationMs: number;
    enrichedChunkCount: number;
    fileCount: number;
    graphEdgeCount: number;
    graphNodeCount: number;
  };
  results: SearchResult[];
}

export interface RagHarnessProviders {
  answerLlm?: LLMProvider;
  embedding?: EmbeddingProvider;
  enrichmentLlm?: LLMProvider;
}

export function createRagHarness(
  collectionName: string,
  providers: RagHarnessProviders = {},
) {
  const fullConfig = getFullAppConfig();
  const embeddingConfig = getEmbeddingModelConfig(fullConfig);
  const systemPrompt = renderPrompt('answer.systemPrompt', {});
  const enrichmentLlm = providers.enrichmentLlm
    ?? new OpenAICompatibleLlm(getEnrichmentModelConfig(fullConfig));
  const answerLlm = providers.answerLlm
    ?? new OpenAICompatibleLlm({
        ...getAnswerModelConfig(fullConfig),
        systemPrompt,
      });
  const embeddingProvider = providers.embedding
    ?? new OpenAICompatibleEmbeddingProvider(embeddingConfig);
  const vectorStore = new QdrantVectorStore(embeddingConfig.dimensions, {
    collectionName,
    url: fullConfig.app.ragDb.qdrant.url,
  });
  const bm25Index = new BM25Index();
  const search = new HybridSearch(vectorStore, bm25Index, embeddingProvider, getRetrievalConfig(fullConfig));

  return {
    async count(): Promise<number> {
      const result = await vectorStore.count();
      if (result.isErr()) throw result.error;
      return result.value;
    },
    async close(chunkIds: string[] = []): Promise<void> {
      if (chunkIds.length > 0) {
        const deleted = await vectorStore.delete(chunkIds);
        if (deleted.isErr()) throw deleted.error;
      }
      vectorStore.close();
    },
    async run(
      repositoryPath: string,
      files: ScannedFile[],
      question: string,
      documentationChunks: Chunk[] = [],
    ): Promise<RagHarnessResult> {
      const startedAt = Date.now();
      log('FILES', 'Received files from indexing or delta detection', { files: files.length });
      const processed = await processFiles(
        repositoryPath,
        files,
        getIngestionConfig(fullConfig).maxTokensPerChunk,
      );
      log('GRAPH', 'Dependency graph created', {
        edges: processed.graphEdgeCount,
        nodes: processed.graphNodeCount,
      });
      const chunks = [...processed.chunks, ...documentationChunks];
      log('CHUNK', 'Source and documentation chunks created', {
        documentationChunks: documentationChunks.length,
        sourceChunks: processed.chunks.length,
        totalChunks: chunks.length,
      });

      const enriched = await enrichChunks(chunks, enrichmentLlm);
      log('ENRICH', 'Chunks enriched', { chunks: enriched.length });
      await indexChunks(enriched, embeddingProvider, vectorStore, bm25Index);
      log('EMBED_STORE', 'Chunks embedded and stored', { chunks: enriched.length });

      const results = await retrieve(question, search);
      log('RETRIEVE', 'Hybrid retrieval completed', { results: results.length });
      const context = buildContext(results);
      log('CONTEXT', 'Retrieval context assembled', { characters: context.length });
      const answer = await answerQuestion(question, context, answerLlm);
      const durationMs = Date.now() - startedAt;
      log('COMPLETE', 'RAG verification completed', { durationMs });

      return {
        answer,
        chunkIds: enriched.map((chunk) => chunk.id),
        metrics: {
          chunkCount: chunks.length,
          durationMs,
          enrichedChunkCount: enriched.length,
          fileCount: files.length,
          graphEdgeCount: processed.graphEdgeCount,
          graphNodeCount: processed.graphNodeCount,
        },
        results,
      };
    },
  };
}
