import { LLMError, type LLMProvider } from '@/services/core/index.js';
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
}

interface ChatCompletionResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

export class OpenAICompatibleLlm implements LLMProvider {
  constructor(private readonly options: OpenAICompatibleLlmOptions) {}

  async generate(prompt: string): Promise<Result<string, LLMError>> {
    const maxRetries = this.options.maxRetries ?? 2;
    let lastError = new LLMError('LLM request failed');
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      const result = await this.request(prompt);
      if (result.isOk()) return result;
      lastError = result.error;
      if (attempt < maxRetries) {
        log('LLM_RETRY', lastError.message, { attempt: attempt + 1 });
        await new Promise((resolve) => setTimeout(resolve, this.options.retryDelayMs ?? 1_000));
      }
    }
    return err(lastError);
  }

  private async request(prompt: string): Promise<Result<string, LLMError>> {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (this.options.apiKey) headers.Authorization = `Bearer ${this.options.apiKey}`;
      
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

function log(stage: string, message: string, metadata: Record<string, unknown>): void {
  console.log(JSON.stringify({ level: 'warn', message, stage, timestamp: new Date().toISOString(), ...metadata }));
}
