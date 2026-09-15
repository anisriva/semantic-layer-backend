/**
 * Service: IndexingService
 *
 * Given a filesystem root and a target collection name, runs the full
 * local ingestion pipeline (scan -> parse/chunk -> graph -> enrich ->
 * embed/index) and reports pipeline metrics. Owns no persistence beyond the
 * Qdrant/BM25 index it writes to. Phase 1: no Postgres/job dependency (see
 * Phase 2 notes in `artifacts/new/1-architecture-and-setup.md`).
 */
import {
  getFullAppConfig,
  getIngestionConfig,
  type FullAppConfig,
} from '@/config/index.js';
import type { Chunk, ScannedFile } from '@/helpers/core/index.js';
import { scanFiles } from '@/helpers/file-scanner.js';
import { processSourceFiles } from '@/helpers/source-processor.js';
import { enrichChunks } from '@/helpers/chunk-enrichment.js';
import { indexChunks } from '@/helpers/chunk-indexer.js';
import { createCollectionProviders, createEnrichmentLlm } from '@/helpers/provider-factory.js';

export interface IndexPathOptions {
  /** Overrides `ragPipeline.ingestion.excludePatterns` from config. */
  excludePatterns?: string[];
  /** Pre-built documentation chunks (e.g. from Confluence) merged in alongside source chunks. */
  documentationChunks?: Chunk[];
}

export interface IndexResult {
  chunkCount: number;
  durationMs: number;
  enrichedChunkCount: number;
  fileCount: number;
  graphEdgeCount: number;
  graphNodeCount: number;
}

/** Wraps the first failing pipeline stage's error with the stage name attached. */
export class IndexingError extends Error {
  constructor(public readonly stage: string, public readonly cause: unknown) {
    super(`Indexing failed at stage "${stage}": ${cause instanceof Error ? cause.message : String(cause)}`);
    this.name = 'IndexingError';
  }
}

export class IndexingService {
  constructor(private readonly fullConfig: FullAppConfig = getFullAppConfig()) {}

  /**
   * Scans `rootPath`, processes files into chunks, merges in any supplied
   * documentation chunks, enriches, embeds, and indexes them into
   * `collectionName`. Single pass, fail fast: the first failing stage is
   * rethrown as an {@link IndexingError}.
   *
   * @returns a zero-count {@link IndexResult} if there is nothing to index.
   */
  async indexPath(
    rootPath: string,
    collectionName: string,
    options: IndexPathOptions = {},
  ): Promise<IndexResult> {
    const startedAt = Date.now();
    const documentationChunks = options.documentationChunks ?? [];
    const ingestionConfig = getIngestionConfig(this.fullConfig);
    const excludePatterns = options.excludePatterns ?? ingestionConfig.excludePatterns;

    let files: ScannedFile[];
    try {
      files = await scanFiles(rootPath, { excludePatterns });
    } catch (error) {
      throw new IndexingError('scan', error);
    }

    if (files.length === 0 && documentationChunks.length === 0) {
      return {
        chunkCount: 0,
        durationMs: Date.now() - startedAt,
        enrichedChunkCount: 0,
        fileCount: 0,
        graphEdgeCount: 0,
        graphNodeCount: 0,
      };
    }

    let graphNodeCount = 0;
    let graphEdgeCount = 0;
    let chunks: Chunk[] = [...documentationChunks];
    if (files.length > 0) {
      try {
        const processed = await processSourceFiles(
          rootPath,
          files,
          ingestionConfig.maxTokensPerChunk,
        );
        chunks = [...processed.chunks, ...documentationChunks];
        graphNodeCount = processed.graphNodeCount;
        graphEdgeCount = processed.graphEdgeCount;
      } catch (error) {
        throw new IndexingError('process', error);
      }
    }

    let enriched: Chunk[];
    try {
      enriched = await enrichChunks(chunks, createEnrichmentLlm(this.fullConfig));
    } catch (error) {
      throw new IndexingError('enrich', error);
    }

    const { embeddingProvider, vectorStore, bm25Index } = createCollectionProviders(
      collectionName,
      this.fullConfig,
    );
    try {
      await indexChunks(enriched, embeddingProvider, vectorStore, bm25Index);
    } catch (error) {
      throw new IndexingError('index', error);
    } finally {
      vectorStore.close();
    }

    return {
      chunkCount: chunks.length,
      durationMs: Date.now() - startedAt,
      enrichedChunkCount: enriched.length,
      fileCount: files.length,
      graphEdgeCount,
      graphNodeCount,
    };
  }
}
