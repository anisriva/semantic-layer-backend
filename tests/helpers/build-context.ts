import type { SearchResult } from '@/helpers/core/index.js';
import { renderPrompt } from '@/config/index.js';

export function buildContext(results: SearchResult[]): string {
  return results.map((result) => {
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
}
