/**
 * Pipeline helper: chunk-indexer
 *
 * Wraps an injected `EmbeddingProvider`, `VectorStore`, and `BM25Index` to
 * embed enriched chunks and persist them for hybrid retrieval. Mirrors
 * `tests/helpers/index-chunks.ts` for production use.
 */
import type {
  BM25Index,
  Chunk,
  EmbeddingProvider,
  VectorStore,
} from '@/helpers/core/index.js';

/**
 * Embeds `chunks` (using each chunk's `nlSummary` when present, falling back
 * to its raw content) and upserts them into `vectorStore`, then adds them to
 * `bm25Index` for keyword retrieval.
 *
 * @throws the underlying `EmbedError`/`StoreError` if embedding or storage
 * fails.
 */
export async function indexChunks(
  chunks: Chunk[],
  embeddingProvider: EmbeddingProvider,
  vectorStore: VectorStore,
  bm25Index: BM25Index,
): Promise<void> {
  const embedded = await embeddingProvider.embed(
    chunks.map((chunk) => chunk.nlSummary || chunk.content),
  );
  if (embedded.isErr()) throw embedded.error;

  const stored = await vectorStore.upsert(
    chunks.map((chunk) => chunk.id),
    embedded.value,
    chunks.map((chunk) => ({
      chunk_type: chunk.metadata.chunkType,
      content: chunk.content,
      declarations: chunk.metadata.declarations,
      doc_title: chunk.metadata.docTitle,
      end_line: chunk.endLine,
      exports: chunk.metadata.exports,
      file_path: chunk.filePath,
      imports: chunk.metadata.imports,
      language: chunk.language,
      links: chunk.metadata.links,
      name: chunk.metadata.name,
      nl_summary: chunk.nlSummary,
      start_line: chunk.startLine,
      tags: chunk.metadata.tags,
    })),
  );
  if (stored.isErr()) throw stored.error;
  bm25Index.addChunks(chunks);
}
