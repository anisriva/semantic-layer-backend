/**
 * Connector: openai-compatible-llm
 *
 * Constructs and exposes an external client: a production `LLMProvider`
 * implementation that talks to any OpenAI chat-completions-compatible
 * endpoint (local Ollama or an external provider). Mirrors
 * `tests/helpers/openai-compatible-llm.ts`; constructed exclusively through
 * `@/helpers/provider-factory.js` so services never `new` it directly.
 */
import { LLMError, type LLMProvider } from '@/helpers/core/index.js';
import { err, ok, type Result } from 'neverthrow';
import { renderPrompt } from '@/config/index.js';

export interface OpenAICompatibleLlmOptions {
  apiKey?: string;
  baseUrl: string;
  maxRetries?: number;
  model: string;
  retryDelayMs?: number;
  timeout?: number;
  systemPrompt?: string;
  oauth2?: {
    oauthUrl?: string;
    clientId?: string;
    clientSecret?: string;
  };
}

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

export class OpenAICompatibleLlm implements LLMProvider {
  private oauthRefresh?: Promise<Result<void, LLMError>>;
  private oauthToken?: string;
  private requestSequence = 0;
  private tokenExpiry?: number;

  constructor(private readonly options: OpenAICompatibleLlmOptions) {}

  async generate(prompt: string): Promise<Result<string, LLMError>> {
    const maxRetries = this.options.maxRetries ?? 2;
    let lastError = new LLMError('LLM request failed');
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      // Refresh OAuth2 token if needed and OAuth2 is properly configured
      if (this.isOAuth2Configured()) {
        const refreshResult = await this.ensureOAuthToken();
        if (refreshResult.isErr()) {
          lastError = refreshResult.error;
          if (attempt < maxRetries) {
            log('warn', 'LLM_RETRY', lastError.message, { attempt: attempt + 1 });
            await new Promise((resolve) => setTimeout(resolve, this.options.retryDelayMs ?? 1_000));
          }
          continue;
        }
      }

      const requestId = ++this.requestSequence;
      const requestStartedAt = Date.now();
      log('info', 'LLM_REQUEST_START', 'LLM request started', { attempt: attempt + 1, requestId });
      const result = await this.request(prompt);
      log('info', 'LLM_REQUEST_COMPLETE', 'LLM request completed', {
        attempt: attempt + 1,
        durationMs: Date.now() - requestStartedAt,
        requestId,
        success: result.isOk(),
      });
      if (result.isOk()) return result;
      lastError = result.error;
      if (attempt < maxRetries) {
        log('warn', 'LLM_RETRY', lastError.message, { attempt: attempt + 1, requestId });
        await new Promise((resolve) => setTimeout(resolve, this.options.retryDelayMs ?? 1_000));
      }
    }
    return err(lastError);
  }

  private isOAuth2Configured(): boolean {
    return !!(
      this.options.oauth2?.oauthUrl &&
      this.options.oauth2?.clientId &&
      this.options.oauth2?.clientSecret
    );
  }

  private async ensureOAuthToken(): Promise<Result<void, LLMError>> {
    if (this.oauthToken && Date.now() < (this.tokenExpiry ?? 0)) return ok(undefined);
    if (!this.oauthRefresh) {
      this.oauthRefresh = this.refreshOAuthToken().finally(() => {
        this.oauthRefresh = undefined;
      });
    }
    return this.oauthRefresh;
  }

  private async refreshOAuthToken(): Promise<Result<void, LLMError>> {
    try {
      if (!this.isOAuth2Configured()) {
        return err(new LLMError('OAuth2 configuration not provided'));
      }

      const oauthUrl = this.options.oauth2!.oauthUrl!;
      const clientId = this.options.oauth2!.clientId!;
      const clientSecret = this.options.oauth2!.clientSecret!;

      const response = await fetch(oauthUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: clientId,
          client_secret: clientSecret,
        }),
      });

      if (!response.ok) {
        return err(new LLMError(`OAuth2 token request failed: ${response.status} ${await response.text()}`));
      }

      const data = await response.json() as { access_token: string; expires_in?: number };
      this.oauthToken = data.access_token;

      // Set expiry with 5-minute buffer before actual expiration
      const expiresIn = data.expires_in ?? 3600; // Default to 1 hour if not provided
      this.tokenExpiry = Date.now() + (expiresIn * 1000) - (5 * 60 * 1000);

      return ok(undefined);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return err(new LLMError(`OAuth2 token refresh failed: ${message}`));
    }
  }

  private async request(prompt: string): Promise<Result<string, LLMError>> {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };

      // Use OAuth2 token if available, otherwise fall back to apiKey
      if (this.oauthToken) {
        headers.Authorization = `Bearer ${this.oauthToken}`;
      } else if (this.options.apiKey) {
        headers.Authorization = `Bearer ${this.options.apiKey}`;
      }

      const systemPrompt = this.options.systemPrompt ?? renderPrompt('answer.systemPrompt', {});
      const messages = [
        { content: systemPrompt, role: 'system' },
        { content: prompt, role: 'user' },
      ];

      const response = await fetch(`${this.options.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
        body: JSON.stringify({
          messages,
          model: this.options.model,
          stream: false,
          temperature: 0,
        }),
        headers,
        method: 'POST',
        signal: AbortSignal.timeout(this.options.timeout ?? 120_000),
      });
      if (!response.ok) {
        if (response.status === 401 && this.isOAuth2Configured()) {
          this.oauthToken = undefined;
          this.tokenExpiry = undefined;
        }
        return err(new LLMError(`LLM API returned ${response.status}: ${await response.text()}`));
      }
      const body = await response.json() as ChatCompletionResponse;
      const content = body.choices?.[0]?.message?.content?.trim();
      return content ? ok(content) : err(new LLMError('LLM API returned no message content'));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return err(new LLMError(`LLM request failed: ${message}`));
    }
  }
}

function log(
  level: 'info' | 'warn',
  stage: string,
  message: string,
  metadata: Record<string, unknown>,
): void {
  console.log(JSON.stringify({ level, message, stage, timestamp: new Date().toISOString(), ...metadata }));
}
