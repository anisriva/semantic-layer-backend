import type { HybridSearch, SearchResult } from '@/services/core/index.js';

export async function retrieve(
  question: string,
  search: HybridSearch,
  topK = 5,
): Promise<SearchResult[]> {
  const result = await search.search(question, { topK });
  if (result.isErr()) throw result.error;
  return result.value;
}
