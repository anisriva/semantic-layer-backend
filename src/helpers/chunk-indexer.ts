/**
 * Pipeline helper: chunk-indexer
 *
 * Wraps an injected `EmbeddingProvider`, `VectorStore`, and `BM25Index` to
 * embed enriched chunks and persist them for hybrid retrieval. Mirrors
 * `tests/helpers/index-chunks.ts` for production use.
 */
import type { LimitFunction } from 'p-limit';
import type {
  BM25Index,
  Chunk,
  EmbeddingProvider,
  VectorStore,
} from '@/helpers/core/index.js';

export async function initializeVectorStore(vectorStore: VectorStore): Promise<void> {
  const count = await vectorStore.count();
  if (count.isErr()) throw count.error;
}

/**
 * Embeds `chunks` (using each chunk's `nlSummary` when present, falling back
 * to its raw content) and upserts them into `vectorStore`, then adds them to
 * `bm25Index` for keyword retrieval. Processes chunks in batches with
 * concurrency control via `embeddingLimit`.
 *
 * @throws the underlying `EmbedError`/`StoreError` if embedding or storage
 * fails.
 */
export async function indexChunks(
  chunks: Chunk[],
  embeddingProvider: EmbeddingProvider,
  vectorStore: VectorStore,
  bm25Index: BM25Index,
  embeddingLimit: LimitFunction,
  modelName?: string,
): Promise<void> {
  console.log(`[ChunkIndexer] Indexing ${chunks.length} chunks`);
  if (modelName) {
    console.log(`[ChunkIndexer] Using embedding model: ${modelName}`);
  }
  
  const BATCH_SIZE = 50;
  const batches: Chunk[][] = [];
  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    batches.push(chunks.slice(i, i + BATCH_SIZE));
  }
  console.log(`[ChunkIndexer] Processing ${batches.length} batches (batch size: ${BATCH_SIZE})`);

  const results = await Promise.allSettled(batches.map((batch) =>
    embeddingLimit(async () => {
      const embedded = await embeddingProvider.embed(
        batch.map((chunk) => chunk.nlSummary || chunk.content),
      );
      if (embedded.isErr()) throw embedded.error;

      const stored = await vectorStore.upsert(
        batch.map((chunk) => chunk.id),
        embedded.value,
        batch.map((chunk) => ({
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
      return batch;
    })
  ));

  const failure = results.find((result) => result.status === 'rejected');
  if (failure) throw failure.reason;

  const successfullyIndexedChunks = results.flatMap((result) => {
    if (result.status === 'rejected') throw result.reason;
    return result.value;
  });

  console.log(`[ChunkIndexer] Adding ${successfullyIndexedChunks.length} chunks to BM25 index`);
  bm25Index.addChunks(successfullyIndexedChunks);
  console.log(`[ChunkIndexer] Successfully indexed ${successfullyIndexedChunks.length} chunks`);
}
