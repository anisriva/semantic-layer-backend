import type { LLMProvider } from '@/helpers/core/index.js';
import { renderPrompt } from '@/config/index.js';

export async function answerQuestion(
  question: string,
  context: string,
  llm: LLMProvider,
): Promise<string> {
  const userPrompt = renderPrompt('answer.userPrompt', {
    question,
    context,
  });
  const answer = await llm.generate(userPrompt);
  if (answer.isErr()) throw answer.error;
  return answer.value;
}
