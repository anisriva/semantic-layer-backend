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
import { answerQuestion, streamAnswer } from '@/helpers/answer-generator.js';
import { createAnswerLlm } from '@/helpers/provider-factory.js';
import { SearchService } from '@/services/search.js';
import { AuditLogDao } from '@/daos/audit-log.js';
import { PipelineStage, MetricsType, ProviderType } from '@/types/audit.js';

export interface ChatAnswer {
  answer: string;
  sources: Array<{ filePath: string; score: number }>;
}

export interface ChatStreamAnswer {
  /** Source references, available immediately (retrieval completes before streaming starts). */
  sources: ChatAnswer['sources'];
  /** Text deltas as the LLM generates the answer (Section 14, SSE conversation endpoint). */
  textStream: AsyncGenerator<string, void, unknown>;
}

/**
 * CHAT-execution audit context (Section 10). Optional: `ChatService` works
 * without it (e.g. ad-hoc, non-persisted queries), but supplying it attributes
 * the RETRIEVAL and CHAT_COMPLETION audit entries to a conversation (and,
 * where available, the user message that triggered them).
 */
export interface ChatAuditOptions {
  conversationId: string;
  messageId?: string;
  userId?: string;
  auditLogDao?: AuditLogDao;
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
  async ask(collectionName: string, question: string, auditOptions?: ChatAuditOptions): Promise<ChatAnswer> {
    const startedAt = Date.now();
    const answerConfig = getAnswerModelConfig(this.fullConfig);
    
    console.log(`[Chat] Starting answer generation for collection "${collectionName}"`);
    console.log(`[Chat] Question: "${question}"`);
    console.log(`[Chat] Answer model: ${answerConfig.model}`);
    console.log(`[Chat] Answer provider: ${answerConfig.baseUrl}`);

    console.log('[Chat] Stage 1: Retrieving context...');
    const results = await this.withRetrievalAudit(auditOptions, () => this.searchService.search(collectionName, question));
    
    console.log('[Chat] Stage 2: Building context from retrieved results...');
    const context = buildContext(results);
    console.log(`[Chat] Context built: ${context.length} characters`);

    console.log('[Chat] Stage 3: Generating answer with LLM...');
    let answer: string;
    const completionStartedAt = Date.now();
    try {
      answer = await answerQuestion(question, context, createAnswerLlm(this.fullConfig), answerConfig.model);
      const answerDuration = Date.now() - startedAt;
      console.log(`[Chat] Answer generated in ${answerDuration}ms`);
      console.log(`[Chat] Answer length: ${answer.length} characters`);
      await this.recordChatCompletionAudit(auditOptions, answerConfig, Date.now() - completionStartedAt);
    } catch (error) {
      await this.recordChatCompletionAudit(auditOptions, answerConfig, Date.now() - completionStartedAt, error);
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

  /**
   * Streaming counterpart to `ask`: retrieves context and assembles the
   * prompt synchronously (same as `ask`), then returns immediately with the
   * source references and a `textStream` the caller drains to receive the
   * answer token-by-token. Used by the SSE conversation endpoint (Section 14)
   * so the caller can persist the accumulated text once the stream ends.
   *
   * @throws the underlying `NotIndexedError`/`SearchError` from
   * `SearchService` unchanged.
   * @throws {ChatGenerationError} if streaming fails before or during generation.
   */
  async askStream(collectionName: string, question: string, auditOptions?: ChatAuditOptions): Promise<ChatStreamAnswer> {
    const answerConfig = getAnswerModelConfig(this.fullConfig);

    console.log(`[Chat] Starting streaming answer generation for collection "${collectionName}"`);
    console.log(`[Chat] Question: "${question}"`);
    console.log(`[Chat] Answer model: ${answerConfig.model}`);
    console.log(`[Chat] Answer provider: ${answerConfig.baseUrl}`);

    console.log('[Chat] Stage 1: Retrieving context...');
    const results = await this.withRetrievalAudit(auditOptions, () => this.searchService.search(collectionName, question));

    console.log('[Chat] Stage 2: Building context from retrieved results...');
    const context = buildContext(results);
    console.log(`[Chat] Context built: ${context.length} characters`);

    console.log('[Chat] Stage 3: Streaming answer from LLM...');
    const llm = createAnswerLlm(this.fullConfig);
    const completionStartedAt = Date.now();

    return {
      sources: results.map((result) => ({
        filePath: result.chunk?.filePath ?? 'unknown',
        score: result.score,
      })),
      textStream: this.wrapStreamErrors(
        streamAnswer(question, context, llm, answerConfig.model),
        auditOptions,
        answerConfig,
        completionStartedAt,
      ),
    };
  }

  /**
   * Wraps `SearchService.search` with a CHAT/RETRIEVAL `AuditLog` entry
   * (Section 10 — "Overall retrieval/search latency"). Query embedding is
   * fused inside `HybridSearch.search` (vector + BM25 in one call, see
   * `@code-rag/core`'s `HybridSearch`), so it is not a separately
   * observable boundary here and is not audited on its own — auditing it
   * would mean re-embedding the query just to measure it, or inventing a
   * duration that was never actually isolated.
   */
  private async withRetrievalAudit<T>(auditOptions: ChatAuditOptions | undefined, run: () => Promise<T>): Promise<T> {
    if (!auditOptions) return run();

    const auditLogDao = auditOptions.auditLogDao ?? new AuditLogDao();
    const startedAt = Date.now();
    try {
      const result = await run();
      await auditLogDao.createCompletedWithPerformanceForConversation(
        auditOptions.conversationId,
        PipelineStage.RETRIEVAL,
        { duration_ms: Date.now() - startedAt },
        { userId: auditOptions.userId, messageId: auditOptions.messageId },
      );
      return result;
    } catch (error) {
      await auditLogDao.createFailedForConversation(
        auditOptions.conversationId,
        PipelineStage.RETRIEVAL,
        MetricsType.PERFORMANCE,
        { userId: auditOptions.userId, messageId: auditOptions.messageId },
      );
      throw error;
    }
  }

  /**
   * Records a CHAT/CHAT_COMPLETION `AuditLog` entry with `CostMetrics` for
   * the final LLM response (Section 10 — "Chat model generation").
   * `OpenAICompatibleLlm` does not currently parse a token-usage field out
   * of the provider response, so `prompt_tokens`/`completion_tokens`/
   * `total_tokens`/`cost_usd` are persisted as `null` rather than
   * fabricated — only `provider`, `model`, and `duration` are genuinely
   * available today.
   */
  private async recordChatCompletionAudit(
    auditOptions: ChatAuditOptions | undefined,
    answerConfig: { model: string; baseUrl: string },
    durationMs: number,
    error?: unknown,
  ): Promise<void> {
    if (!auditOptions) return;

    const auditLogDao = auditOptions.auditLogDao ?? new AuditLogDao();
    if (error) {
      await auditLogDao.createFailedForConversation(
        auditOptions.conversationId,
        PipelineStage.CHAT_COMPLETION,
        MetricsType.COST,
        { userId: auditOptions.userId, messageId: auditOptions.messageId },
      );
      return;
    }

    await auditLogDao.createCompletedWithCostForConversation(
      auditOptions.conversationId,
      PipelineStage.CHAT_COMPLETION,
      {
        cost_operation_type: 'CHAT_COMPLETION',
        provider_type: deriveProviderType(answerConfig.baseUrl),
        model_name: answerConfig.model,
        base_url: answerConfig.baseUrl,
        duration_ms: durationMs,
      },
      { userId: auditOptions.userId, messageId: auditOptions.messageId },
    );
  }

  /** Wraps a raw `streamAnswer` generator, translating thrown `LLMError`s into `ChatGenerationError` and recording the CHAT_COMPLETION audit entry once streaming finishes. */
  private async *wrapStreamErrors(
    source: AsyncGenerator<string, void, unknown>,
    auditOptions: ChatAuditOptions | undefined,
    answerConfig: { model: string; baseUrl: string },
    completionStartedAt: number,
  ): AsyncGenerator<string, void, unknown> {
    try {
      yield* source;
      await this.recordChatCompletionAudit(auditOptions, answerConfig, Date.now() - completionStartedAt);
    } catch (error) {
      await this.recordChatCompletionAudit(auditOptions, answerConfig, Date.now() - completionStartedAt, error);
      throw new ChatGenerationError('Failed to generate a streaming answer', error);
    }
  }
}

/**
 * Best-effort `ProviderType` classification from a configured base URL, so
 * CHAT `CostMetrics` rows (which require a non-null `provider_type`, same
 * as JOB embedding/enrichment `CostMetrics` rows) can be populated without
 * a request-time provider handshake. Falls back to `CUSTOM` for
 * self-hosted/unrecognized endpoints.
 */
function deriveProviderType(baseUrl: string): ProviderType {
  const url = baseUrl.toLowerCase();
  if (url.includes('openai.com')) return ProviderType.OPENAI;
  if (url.includes('anthropic.com')) return ProviderType.ANTHROPIC;
  if (url.includes('azure.com') || url.includes('.azure.')) return ProviderType.AZURE;
  if (url.includes('ollama') || url.includes(':11434')) return ProviderType.OLLAMA;
  return ProviderType.CUSTOM;
}
