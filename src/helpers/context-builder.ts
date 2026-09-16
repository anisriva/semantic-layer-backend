/**
 * Pipeline helper: context-builder
 *
 * Wraps the `context.chunkTemplate` prompt template to turn
 * `SearchResult[]` into a single LLM-ready context string. Mirrors
 * `tests/helpers/build-context.ts` for production use.
 */
import type { SearchResult } from '@/helpers/core/index.js';
import { renderPrompt } from '@/config/index.js';

/**
 * Renders each search result into a source-aware context block and joins
 * them into one context string for answer generation.
 */
export function buildContext(results: SearchResult[]): string {
  console.log(`[ContextBuilder] Building context from ${results.length} search results`);
  
  const context = results.map((result) => {
    const metadata = result.chunk?.metadata ?? result.metadata;
    const chunkContext = renderPrompt('context.chunkTemplate', {
      filePath: result.chunk?.filePath ?? 'unknown',
      chunkType: metadata.chunkType,
      title: metadata.docTitle ?? metadata.name,
      tags: metadata.tags?.join(', ') ?? '',
      summary: result.nlSummary,
      content: result.content,
    });
    return chunkContext;
  }).join('\n\n---\n\n');
  
  console.log(`[ContextBuilder] Context assembly complete`);
  return context;
}
