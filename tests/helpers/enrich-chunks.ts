import type { Chunk, LLMProvider } from '@/services/core/index.js';
import { renderPrompt } from '@/config/index.js';

export async function enrichChunks(chunks: Chunk[], llm: LLMProvider): Promise<Chunk[]> {
  const enriched: Chunk[] = [];
  for (const chunk of chunks) {
    const prompt = renderPrompt('enrichment.chunkSummary', {
      language: chunk.language,
      chunkType: chunk.metadata.chunkType,
      content: chunk.content,
    });
    const result = await llm.generate(prompt);
    if (result.isErr()) throw result.error;
    enriched.push({ ...chunk, nlSummary: result.value });
  }
  return enriched;
}
