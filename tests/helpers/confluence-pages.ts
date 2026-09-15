import {
  MarkdownParser,
  type Chunk,
  type ConfluencePage,
} from '@/services/core/index.js';

export function confluencePagesToChunks(
  pages: ConfluencePage[],
  maxTokensPerChunk: number,
): Chunk[] {
  const parser = new MarkdownParser({ maxTokensPerChunk });
  return pages.flatMap((page) => {
    const parsed = parser.parse(
      `confluence://${page.spaceKey}/${page.id}.md`,
      `---\ntitle: ${page.title}\ntags: [${page.labels.join(', ')}]\n---\n\n${page.plainText}`,
    );
    if (parsed.isErr()) throw parsed.error;
    return parsed.value.chunks;
  });
}
