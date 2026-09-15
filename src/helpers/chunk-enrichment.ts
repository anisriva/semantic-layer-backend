/**
 * Pipeline helper: chunk-enrichment
 *
 * Wraps an injected `LLMProvider` and the `enrichment.chunkSummary` prompt
 * template to attach a natural-language `nlSummary` to each chunk. Mirrors
 * `tests/helpers/enrich-chunks.ts` for production use.
 */
import type { Chunk, LLMProvider } from '@/helpers/core/index.js';
import { renderPrompt } from '@/config/index.js';

/**
 * Generates and attaches an `nlSummary` to every chunk in `chunks` using
 * `llm`.
 *
 * @throws the underlying `LLMError` if any generation call fails.
 */
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
