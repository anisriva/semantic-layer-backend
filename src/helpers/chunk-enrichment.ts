/**
 * Pipeline helper: chunk-enrichment
 *
 * Wraps an injected `LLMProvider` and the `enrichment.chunkSummary` prompt
 * template to attach a natural-language `nlSummary` to each chunk. Mirrors
 * `tests/helpers/enrich-chunks.ts` for production use.
 */
import type { LimitFunction } from 'p-limit';
import type { Chunk, LLMProvider } from '@/helpers/core/index.js';
import { renderPrompt } from '@/config/index.js';

/**
 * Generates and attaches an `nlSummary` to every chunk in `chunks` using
 * `llm`.
 *
 * @throws the underlying `LLMError` if any generation call fails.
 */
export async function enrichChunks(
  chunks: Chunk[],
  llm: LLMProvider,
  enrichmentLimit: LimitFunction,
  modelName?: string,
): Promise<Chunk[]> {
  console.log(`[ChunkEnrichment] Enriching ${chunks.length} chunks`);
  if (modelName) {
    console.log(`[ChunkEnrichment] Using model: ${modelName}`);
  }
  
  const results = await Promise.allSettled(chunks.map((chunk) => enrichmentLimit(async () => {
    const prompt = renderPrompt('enrichment.chunkSummary', {
      language: chunk.language,
      chunkType: chunk.metadata.chunkType,
      content: chunk.content,
    });
    const result = await llm.generate(prompt);
    if (result.isErr()) throw result.error;
    return { ...chunk, nlSummary: result.value };
  })));
  const failure = results.find((result) => result.status === 'rejected');
  if (failure) throw failure.reason;
  
  console.log(`[ChunkEnrichment] Successfully enriched ${results.length} chunks`);
  return results.map((result) => {
    if (result.status === 'rejected') throw result.reason;
    return result.value;
  });
}
