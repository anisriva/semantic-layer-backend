/**
 * Pipeline helper: source-processor
 *
 * Wraps CodeRAG core's `TreeSitterParser`, `MarkdownParser`, `ASTChunker`,
 * and `GraphBuilder` to turn `ScannedFile[]` into `Chunk[]` plus dependency
 * graph node/edge counts. Mirrors `tests/helpers/process-files.ts` for
 * production use.
 */
import {
  ASTChunker,
  GraphBuilder,
  MarkdownParser,
  TreeSitterParser,
  type Chunk,
  type ParsedFile,
  type ScannedFile,
} from '@/helpers/core/index.js';

export interface ProcessedSource {
  chunks: Chunk[];
  graphEdgeCount: number;
  graphNodeCount: number;
}

/**
 * Parses and chunks `files` (Markdown files are parsed directly into `doc`
 * chunks; other files are Tree-sitter parsed and AST-chunked), then builds
 * the repository's dependency graph from the parsed source files.
 *
 * @throws the underlying `ParseError`/`ChunkError`/`GraphError` if any stage
 * fails (files that fail Tree-sitter parsing are skipped, not thrown).
 */
export async function processSourceFiles(
  repositoryPath: string,
  files: ScannedFile[],
  maxTokensPerChunk: number,
): Promise<ProcessedSource> {
  const parser = new TreeSitterParser();
  const initialized = await parser.initialize();
  if (initialized.isErr()) throw initialized.error;

  const chunker = new ASTChunker({ maxTokensPerChunk });
  const markdownParser = new MarkdownParser({ maxTokensPerChunk });
  const chunks: Chunk[] = [];
  const parsedFiles: ParsedFile[] = [];

  try {
    for (const file of files) {
      if (MarkdownParser.isMarkdownFile(file.filePath)) {
        const parsedMarkdown = markdownParser.parse(file.filePath, file.content);
        if (parsedMarkdown.isErr()) throw parsedMarkdown.error;
        chunks.push(...parsedMarkdown.value.chunks);
        continue;
      }

      const parsed = await parser.parse(file.filePath, file.content);
      if (parsed.isErr()) continue;
      parsedFiles.push(parsed.value);
      const chunked = await chunker.chunk(parsed.value);
      if (chunked.isErr()) throw chunked.error;
      chunks.push(...chunked.value);
    }
  } finally {
    parser.dispose();
  }

  const graph = new GraphBuilder(repositoryPath).buildFromFiles(parsedFiles);
  if (graph.isErr()) throw graph.error;
  return {
    chunks,
    graphEdgeCount: graph.value.edgeCount(),
    graphNodeCount: graph.value.nodeCount(),
  };
}
