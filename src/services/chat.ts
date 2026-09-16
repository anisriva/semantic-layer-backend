/**
 * Service: ChatService
 *
 * Accepts a scope-bound question, retrieves context through
 * `SearchService`, assembles and sends the LLM request, and returns an
 * answer with preserved chunk/file references. Does not persist messages in
 * Phase 1 — returns a transient answer shape that Phase 2's
 * `ConversationService` can persist without `ChatService` itself depending
 * on Postgres.
 */
import { getFullAppConfig, getAnswerModelConfig, type FullAppConfig } from '@/config/index.js';
import { buildContext } from '@/helpers/context-builder.js';
import { answerQuestion } from '@/helpers/answer-generator.js';
import { createAnswerLlm } from '@/helpers/provider-factory.js';
import { SearchService } from '@/services/search.js';

export interface ChatAnswer {
  answer: string;
  sources: Array<{ filePath: string; score: number }>;
}

/** Thrown when answer generation itself fails (after retrieval succeeded). */
export class ChatGenerationError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'ChatGenerationError';
  }
}

export class ChatService {
  constructor(
    private readonly searchService: SearchService = new SearchService(),
    private readonly fullConfig: FullAppConfig = getFullAppConfig(),
  ) {}

  /**
   * Retrieves context for `question` from `collectionName`, then generates
   * a grounded natural-language answer with source references.
   *
   * @throws the underlying `NotIndexedError`/`SearchError` from
   * `SearchService` unchanged.
   * @throws {ChatGenerationError} if answer generation fails.
   */
  async ask(collectionName: string, question: string): Promise<ChatAnswer> {
    const startedAt = Date.now();
    const answerConfig = getAnswerModelConfig(this.fullConfig);
    
    console.log(`[Chat] Starting answer generation for collection "${collectionName}"`);
    console.log(`[Chat] Question: "${question}"`);
    console.log(`[Chat] Answer model: ${answerConfig.model}`);
    console.log(`[Chat] Answer provider: ${answerConfig.baseUrl}`);

    console.log('[Chat] Stage 1: Retrieving context...');
    const results = await this.searchService.search(collectionName, question);
    
    console.log('[Chat] Stage 2: Building context from retrieved results...');
    const context = buildContext(results);
    console.log(`[Chat] Context built: ${context.length} characters`);

    console.log('[Chat] Stage 3: Generating answer with LLM...');
    let answer: string;
    try {
      answer = await answerQuestion(question, context, createAnswerLlm(this.fullConfig), answerConfig.model);
      const answerDuration = Date.now() - startedAt;
      console.log(`[Chat] Answer generated in ${answerDuration}ms`);
      console.log(`[Chat] Answer length: ${answer.length} characters`);
    } catch (error) {
      throw new ChatGenerationError('Failed to generate an answer', error);
    }

    const totalDuration = Date.now() - startedAt;
    console.log(`[Chat] Complete: Total duration ${totalDuration}ms`);

    return {
      answer,
      sources: results.map((result) => ({
        filePath: result.chunk?.filePath ?? 'unknown',
        score: result.score,
      })),
    };
  }
}
