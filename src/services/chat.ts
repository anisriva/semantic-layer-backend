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
import { getFullAppConfig, type FullAppConfig } from '@/config/index.js';
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
    const results = await this.searchService.search(collectionName, question);
    const context = buildContext(results);

    let answer: string;
    try {
      answer = await answerQuestion(question, context, createAnswerLlm(this.fullConfig));
    } catch (error) {
      throw new ChatGenerationError('Failed to generate an answer', error);
    }

    return {
      answer,
      sources: results.map((result) => ({
        filePath: result.chunk?.filePath ?? 'unknown',
        score: result.score,
      })),
    };
  }
}
