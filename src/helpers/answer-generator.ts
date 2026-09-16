/**
 * Pipeline helper: answer-generator
 *
 * Wraps an injected `LLMProvider` and the `answer.userPrompt` template to
 * produce the final natural-language answer from a question and assembled
 * context. Mirrors `tests/helpers/answer-question.ts` for production use.
 */
import type { LLMProvider } from '@/helpers/core/index.js';
import { renderPrompt } from '@/config/index.js';

/**
 * Generates an answer to `question` grounded in `context` using `llm`.
 *
 * @throws the underlying `LLMError` if generation fails.
 */
export async function answerQuestion(
  question: string,
  context: string,
  llm: LLMProvider,
  modelName?: string,
): Promise<string> {
  console.log('[AnswerGenerator] Rendering answer prompt template');
  if (modelName) {
    console.log(`[AnswerGenerator] Using model: ${modelName}`);
  }
  const userPrompt = renderPrompt('answer.userPrompt', {
    question,
    context,
  });
  console.log(`[AnswerGenerator] Prompt rendered: ${userPrompt.length} characters`);
  
  console.log('[AnswerGenerator] Sending request to LLM...');
  const answer = await llm.generate(userPrompt);
  if (answer.isErr()) {
    console.error('[AnswerGenerator] LLM generation failed:', answer.error);
    throw answer.error;
  }
  
  console.log('[AnswerGenerator] LLM response received successfully');
  return answer.value;
}
