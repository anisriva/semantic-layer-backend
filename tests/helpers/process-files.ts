import {
  ASTChunker,
  GraphBuilder,
  MarkdownParser,
  TreeSitterParser,
  type Chunk,
  type ParsedFile,
  type ScannedFile,
} from '@/services/core/index.js';

export interface ProcessedFiles {
  chunks: Chunk[];
  graphEdgeCount: number;
  graphNodeCount: number;
}

export async function processFiles(
  repositoryPath: string,
  files: ScannedFile[],
  maxTokensPerChunk: number,
): Promise<ProcessedFiles> {
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
