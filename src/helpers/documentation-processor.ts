/**
 * Pipeline helper: documentation-processor
 *
 * Wraps CodeRAG core's `MarkdownParser` to turn external documentation (e.g.
 * Confluence pages) into `doc` `Chunk[]`. Mirrors
 * `tests/helpers/confluence-pages.ts` for production use. Only the
 * page-to-chunk transform is implemented here; the Confluence connector
 * itself (fetching pages) is future work.
 */
import { MarkdownParser, type Chunk, type ConfluencePage } from '@/helpers/core/index.js';

/**
 * Converts Confluence `pages` into Markdown-parsed `doc` chunks by rendering
 * each page's plain text with a frontmatter block carrying its title/labels.
 *
 * @throws the underlying `ParseError` if a page fails to parse.
 */
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
