/**
 * Pipeline helper: source-processor
 *
 * Wraps CodeRAG core's `TreeSitterParser`, `MarkdownParser`, `ASTChunker`,
 * and `GraphBuilder` to turn `ScannedFile[]` into `Chunk[]` plus dependency
 * graph node/edge counts. Uses ExtendedTreeSitterParser for full language support.
 * Mirrors `tests/helpers/process-files.ts` for production use.
 */
import { createHash } from 'node:crypto';
import { ok, err, type Result } from 'neverthrow';
import {
  ASTChunker,
  GraphBuilder,
  MarkdownParser,
  type Chunk,
  type ParsedFile,
  type ScannedFile,
  type ChunkType,
} from '@/helpers/core/index.js';
import { ExtendedTreeSitterParser } from './extended-tree-sitter-parser.js';
import { ParseError } from '@/helpers/core/types/index.js';

export interface ProcessedSource {
  chunks: Chunk[];
  graphEdgeCount: number;
  graphNodeCount: number;
}

/**
 * Simple text-based chunker for files that fail tree-sitter parsing.
 * Chunks content by line count as a fallback mechanism.
 */
export class TextChunker {
  private maxTokensPerChunk: number;

  constructor(maxTokensPerChunk: number) {
    this.maxTokensPerChunk = maxTokensPerChunk;
  }

  /**
   * Chunk file content by lines as a fallback when tree-sitter parsing fails.
   */
  chunk(filePath: string, content: string): Result<Chunk[], ParseError> {
    try {
      const lines = content.split('\n');
      const chunks: Chunk[] = [];
      const maxLinesPerChunk = this.maxTokensPerChunk * 4; // Approximate 4 chars per token

      let currentChunkLines: string[] = [];
      let currentChunkStartLine = 0;

      for (let i = 0; i < lines.length; i++) {
        currentChunkLines.push(lines[i]);

        // Check if we should start a new chunk
        const currentContent = currentChunkLines.join('\n');
        if (currentContent.length > maxLinesPerChunk || i === lines.length - 1) {
          const chunkContent = currentChunkLines.join('\n');
          const chunkId = this.generateChunkId(filePath, currentChunkStartLine, chunkContent);
          const chunkType = this.inferChunkType(chunkContent);

          chunks.push({
            id: chunkId,
            content: chunkContent,
            nlSummary: `Text chunk from ${filePath} (lines ${currentChunkStartLine}-${i})`,
            filePath,
            startLine: currentChunkStartLine,
            endLine: i,
            language: this.detectLanguage(filePath),
            metadata: {
              chunkType: chunkType,
              name: `${filePath}:${currentChunkStartLine}-${i}`,
              declarations: [],
              imports: [],
              exports: [],
            },
          });

          currentChunkLines = [];
          currentChunkStartLine = i + 1;
        }
      }

      return ok(chunks);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return err(new ParseError(`Failed to chunk ${filePath} as text: ${message}`));
    }
  }

  private generateChunkId(filePath: string, startLine: number, content: string): string {
    return createHash('sha256')
      .update(`${filePath}${startLine}${content}`)
      .digest('hex');
  }

  private inferChunkType(content: string): ChunkType {
    const trimmed = content.trimStart();
    if (trimmed.startsWith('function') || trimmed.startsWith('def ')) {
      return 'function';
    }
    if (trimmed.startsWith('class ')) {
      return 'class';
    }
    if (trimmed.startsWith('#') || trimmed.startsWith('//') || trimmed.startsWith('/*')) {
      return 'doc';
    }
    return 'module';
  }

  private detectLanguage(filePath: string): string {
    const ext = filePath.split('.').pop()?.toLowerCase() || 'unknown';
    return ext;
  }
}

/**
 * Parses and chunks `files` (Markdown files are parsed directly into `doc`
 * chunks; other files are Tree-sitter parsed and AST-chunked), then builds
 * the repository's dependency graph from the parsed source files.
 *
 * Files that fail Tree-sitter parsing are chunked using a text-based fallback.
 *
 * @throws the underlying `ParseError`/`ChunkError`/`GraphError` if any stage
 * fails (files that fail both Tree-sitter and text chunking are skipped).
 */
export async function processSourceFiles(
  repositoryPath: string,
  files: ScannedFile[],
  maxTokensPerChunk: number,
): Promise<ProcessedSource> {
  const parser = new ExtendedTreeSitterParser();
  const initialized = await parser.initialize();
  if (initialized.isErr()) throw initialized.error;

  const chunker = new ASTChunker({ maxTokensPerChunk });
  const textChunker = new TextChunker(maxTokensPerChunk);
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
      if (parsed.isErr()) {
        console.warn(`Tree-sitter parsing failed for ${file.filePath}, using text fallback`);
        const textChunked = textChunker.chunk(file.filePath, file.content);
        if (textChunked.isOk()) {
          chunks.push(...textChunked.value);
        } else {
          console.error(`Text chunking also failed for ${file.filePath}: ${textChunked.error.message}`);
        }
        continue;
      }

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
