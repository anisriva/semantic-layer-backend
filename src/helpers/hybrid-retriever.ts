/**
 * Pipeline helper: hybrid-retriever
 *
 * Wraps CodeRAG core's `HybridSearch` to run a query and return
 * `SearchResult[]`. Mirrors `tests/helpers/retrieve.ts` for production use.
 */
import type { HybridSearch, SearchResult } from '@/helpers/core/index.js';

/**
 * Runs `question` through `search` and returns up to `topK` results.
 *
 * @throws the underlying search error if retrieval fails.
 */
export async function retrieve(
  question: string,
  search: HybridSearch,
  topK = 5,
): Promise<SearchResult[]> {
  console.log(`[HybridRetriever] Executing search with topK=${topK}`);
  const result = await search.search(question, { topK });
  if (result.isErr()) {
    console.error('[HybridRetriever] Search failed:', result.error);
    throw result.error;
  }
  console.log(`[HybridRetriever] Search completed successfully`);
  return result.value;
}
