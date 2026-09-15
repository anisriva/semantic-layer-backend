import {
  getAnswerModelConfig,
  getEmbeddingModelConfig,
  getFullAppConfig,
  getRetrievalConfig,
  renderPrompt,
} from '@/config/index.js';
import {
  BM25Index,
  HybridSearch,
  OpenAICompatibleEmbeddingProvider,
  QdrantVectorStore,
  type EmbeddingProvider,
  type LLMProvider,
  type SearchResult,
} from '@/helpers/core/index.js';
import { answerQuestion } from './answer-question.js';
import { buildContext } from './build-context.js';
import { loadChunks } from './load-chunks.js';
import { log } from './log.js';
import { OpenAICompatibleLlm } from './openai-compatible-llm.js';
import { retrieve } from './retrieve.js';

export interface QueryIndexProviders {
  answerLlm?: LLMProvider;
  embedding?: EmbeddingProvider;
}

export interface QueryIndexResult {
  answer: string;
  indexedChunkCount: number;
  results: SearchResult[];
}

export async function queryIndex(
  collectionName: string,
  question: string,
  providers: QueryIndexProviders = {},
): Promise<QueryIndexResult> {
  const fullConfig = getFullAppConfig();
  const embeddingConfig = getEmbeddingModelConfig(fullConfig);
  const systemPrompt = renderPrompt('answer.systemPrompt', {});
  const chunks = await loadChunks(fullConfig.app.ragDb.qdrant.url, collectionName);
  if (chunks.length === 0) throw new Error(`Qdrant collection ${collectionName} contains no indexed chunks`);
  log('LOAD_INDEX', 'Loaded persisted chunks from Qdrant', { chunks: chunks.length });

  const bm25 = new BM25Index();
  bm25.addChunks(chunks);
  const embedding = providers.embedding ?? new OpenAICompatibleEmbeddingProvider(embeddingConfig);
  const vectorStore = new QdrantVectorStore(embeddingConfig.dimensions, {
    collectionName,
    url: fullConfig.app.ragDb.qdrant.url,
  });
  const search = new HybridSearch(vectorStore, bm25, embedding, getRetrievalConfig(fullConfig));
  const results = await retrieve(question, search);
  const context = buildContext(results);
  const answerLlm = providers.answerLlm
    ?? new OpenAICompatibleLlm({
        ...getAnswerModelConfig(fullConfig),
        systemPrompt,
      });
  const answer = await answerQuestion(question, context, answerLlm);
  vectorStore.close();
  return { answer, indexedChunkCount: chunks.length, results };
}
