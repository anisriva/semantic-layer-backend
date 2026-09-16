/**
 * Service: IndexingService
 *
 * Given a filesystem root and a target collection name, runs the full
 * local ingestion pipeline (scan -> parse/chunk -> graph -> enrich ->
 * embed/index) and reports pipeline metrics. Owns no persistence beyond the
 * Qdrant/BM25 index it writes to. Phase 1: no Postgres/job dependency (see
 * Phase 2 notes in `artifacts/new/1-architecture-and-setup.md`).
 *
 * Concurrency Model:
 * - Uses p-limit for async I/O concurrency control (not multi-core threading)
 * - Node.js single-threaded event loop with parallel network I/O
 * - Optimizes for I/O-bound operations (LLM calls, embeddings, vector DB)
 * - CPU-bound tasks (parsing, chunking) still run sequentially on main thread
 * - Concurrency is capped at min(configured value, file count) to avoid overhead
 */
import pLimit from 'p-limit';
import {
  getFullAppConfig,
  getIngestionConfig,
  getEmbeddingModelConfig,
  getEnrichmentModelConfig,
  type FullAppConfig,
} from '@/config/index.js';
import type { Chunk, ScannedFile, ParsedFile } from '@/helpers/core/index.js';
import { scanFiles } from '@/helpers/file-scanner.js';
import { enrichChunks } from '@/helpers/chunk-enrichment.js';
import { indexChunks, initializeVectorStore } from '@/helpers/chunk-indexer.js';
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

interface FileProcessingResult {
  chunks: Chunk[];
  enrichedChunks: Chunk[];
  success: boolean;
  error?: unknown;
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
   * `collectionName`. Processes files incrementally with progress tracking.
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

    // ============================================
    // STAGE 1: Scan files
    // ============================================
    console.log('[Indexing] Starting file scan...');
    let files: ScannedFile[];
    try {
      files = await scanFiles(rootPath, { excludePatterns });
      console.log(`[Indexing] Scan complete: ${files.length} files found`);
    } catch (error) {
      throw new IndexingError('scan', error);
    }

    if (files.length === 0 && documentationChunks.length === 0) {
      console.log('[Indexing] No files to index');
      return {
        chunkCount: 0,
        durationMs: Date.now() - startedAt,
        enrichedChunkCount: 0,
        fileCount: 0,
        graphEdgeCount: 0,
        graphNodeCount: 0,
      };
    }

    // ============================================
    // STAGE 2: Initialize providers and helpers
    // ============================================
    console.log('[Indexing] Initializing LLM and indexing providers...');
    const embeddingConfig = getEmbeddingModelConfig(this.fullConfig);
    const enrichmentConfig = getEnrichmentModelConfig(this.fullConfig);
    console.log(`[Indexing] Embedding model: ${embeddingConfig.model} (${embeddingConfig.baseUrl})`);
    console.log(`[Indexing] Enrichment model: ${enrichmentConfig.model} (${enrichmentConfig.baseUrl})`);
    
    const enrichmentLlm = createEnrichmentLlm(this.fullConfig);
    const { embeddingProvider, vectorStore, bm25Index } = createCollectionProviders(
      collectionName,
      this.fullConfig,
    );
    try {
      console.log('[Indexing] Initializing vector store...');
      await initializeVectorStore(vectorStore);
      const count = await vectorStore.count();
      if (count.isErr()) {
        console.error('[Indexing] Failed to check vector store count:', count.error);
      } else {
        console.log(`[Indexing] Vector store ready with ${count.value} existing points`);
      }
    } catch (error) {
      vectorStore.close();
      throw new IndexingError('initialize-vector-store', error);
    }

    // ============================================
    // STAGE 3: Process files incrementally with concurrency
    // ============================================
    // Cap concurrency at the number of files to avoid unnecessary overhead
    const effectiveConcurrency = Math.min(ingestionConfig.concurrency, files.length);
    console.log(`[Indexing] Starting concurrent processing of ${files.length} files with file concurrency ${ingestionConfig.concurrency} (effective: ${effectiveConcurrency}) and enrichment concurrency ${ingestionConfig.enrichmentConcurrency}`);
    console.log(`[Indexing] Concurrency model: async I/O parallelism (single-threaded event loop, not multi-core)`);

    let totalChunks: Chunk[] = [...documentationChunks];
    let totalEnrichedChunks: Chunk[] = [];
    let graphNodeCount = 0;
    let graphEdgeCount = 0;

    // Create concurrency limiter
    const limit = pLimit(Math.max(1, effectiveConcurrency));
    const enrichmentLimit = pLimit(ingestionConfig.enrichmentConcurrency);
    const embeddingLimit = pLimit(ingestionConfig.embeddingConcurrency);
    let processedCount = 0;

    // Process source files concurrently with limited concurrency
    const processingPromises = files.map((file, index) =>
      limit(async (): Promise<FileProcessingResult> => {
        const startTime = Date.now();
        try {
          console.log(`[Indexing] [${index + 1}/${files.length}] Starting: ${file.filePath}`);

          // Chunk the file
          const chunkStartTime = Date.now();
          const fileChunks = await this.chunkFile(file, ingestionConfig.maxTokensPerChunk);
          const chunkDuration = Date.now() - chunkStartTime;

          if (fileChunks.length === 0) {
            console.warn(`[Indexing] [${index + 1}/${files.length}] No chunks generated in ${chunkDuration}ms: ${file.filePath} (file may be empty or unsupported)`);
            processedCount++;
            const progress = (processedCount / files.length * 100).toFixed(1);
            console.log(`[Indexing] [${index + 1}/${files.length}] Skipped in ${chunkDuration}ms - Progress: ${processedCount}/${files.length} files (${progress}%)`);
            return {
              chunks: [],
              enrichedChunks: [],
              success: true
            };
          }

          console.log(`[Indexing] [${index + 1}/${files.length}] Chunked ${fileChunks.length} chunks in ${chunkDuration}ms: ${file.filePath}`);

          // Enrich the chunks
          const enrichStartTime = Date.now();
          const enrichedFileChunks = await enrichChunks(fileChunks, enrichmentLlm, enrichmentLimit, enrichmentConfig.model);
          const enrichDuration = Date.now() - enrichStartTime;
          console.log(`[Indexing] [${index + 1}/${files.length}] Enriched ${enrichedFileChunks.length} chunks in ${enrichDuration}ms: ${file.filePath}`);

          // Index the enriched chunks
          const indexStartTime = Date.now();
          await indexChunks(enrichedFileChunks, embeddingProvider, vectorStore, bm25Index, embeddingLimit, embeddingConfig.model);
          const indexDuration = Date.now() - indexStartTime;
          console.log(`[Indexing] [${index + 1}/${files.length}] Indexed ${enrichedFileChunks.length} chunks in ${indexDuration}ms: ${file.filePath}`);

          processedCount++;
          const totalDuration = Date.now() - startTime;
          const progress = (processedCount / files.length * 100).toFixed(1);
          console.log(`[Indexing] [${index + 1}/${files.length}] Completed in ${totalDuration}ms - Progress: ${processedCount}/${files.length} files (${progress}%)`);

          return {
            chunks: fileChunks,
            enrichedChunks: enrichedFileChunks,
            success: true
          };
        } catch (error) {
          const errorDuration = Date.now() - startTime;
          console.error(`[Indexing] [${index + 1}/${files.length}] Failed after ${errorDuration}ms: ${file.filePath}`, error);
          processedCount++;
          return {
            chunks: [],
            enrichedChunks: [],
            success: false,
            error
          };
        }
      })
    );

    // Wait for all processing to complete
    const results = await Promise.all(processingPromises);

    // Aggregate results
    for (const result of results) {
      if (result.success) {
        totalChunks.push(...result.chunks);
        totalEnrichedChunks.push(...result.enrichedChunks);
      } else {
        console.error(`[Indexing] Failed to process a file, continuing with remaining files`);
      }
    }

    // Check if any files failed
    const failedCount = results.filter(r => !r.success).length;
    if (failedCount > 0) {
      console.warn(`[Indexing] ${failedCount} files failed to process out of ${files.length} total`);
    }

    const processingDuration = Date.now() - startedAt;
    console.log(`[Indexing] File processing summary: ${processedCount - failedCount}/${files.length} successful, ${failedCount} failed in ${processingDuration}ms`);

    // Process documentation chunks if provided
    if (documentationChunks.length > 0) {
      console.log(`[Indexing] Processing ${documentationChunks.length} documentation chunks...`);

      try {
        const enrichedDocChunks = await enrichChunks(documentationChunks, enrichmentLlm, enrichmentLimit, enrichmentConfig.model);
        console.log(`[Indexing] → Enriched ${enrichedDocChunks.length} documentation chunks`);
        totalEnrichedChunks.push(...enrichedDocChunks);

        await indexChunks(enrichedDocChunks, embeddingProvider, vectorStore, bm25Index, embeddingLimit, embeddingConfig.model);
        console.log(`[Indexing] → Indexed ${enrichedDocChunks.length} documentation chunks`);
      } catch (error) {
        throw new IndexingError('enrich', error);
      }
    }

    // ============================================
    // STAGE 4: Build dependency graph
    // ============================================
    console.log('[Indexing] Building dependency graph...');
    if (files.length > 0) {
      try {
        const graphData = await this.buildGraph(rootPath, files);
        graphNodeCount = graphData.graphNodeCount;
        graphEdgeCount = graphData.graphEdgeCount;
        console.log(`[Indexing] Graph built: ${graphNodeCount} nodes, ${graphEdgeCount} edges`);
      } catch (error) {
        throw new IndexingError('graph', error);
      }
    }

    // ============================================
    // STAGE 5: Cleanup and return results
    // ============================================
    console.log('[Indexing] Cleaning up resources...');
    vectorStore.close();

    const durationMs = Date.now() - startedAt;
    console.log(`[Indexing] Complete: ${totalChunks.length} chunks processed in ${durationMs}ms`);

    return {
      chunkCount: totalChunks.length,
      durationMs,
      enrichedChunkCount: totalEnrichedChunks.length,
      fileCount: files.length,
      graphEdgeCount,
      graphNodeCount,
    };
  }

  /**
   * Chunks a single file using the appropriate parser (Markdown or Tree-sitter).
   */
  private async chunkFile(
    file: ScannedFile,
    maxTokensPerChunk: number,
  ): Promise<Chunk[]> {
    const { MarkdownParser, ASTChunker } = await import('@/helpers/core/index.js');
    const { ExtendedTreeSitterParser } = await import('@/helpers/extended-tree-sitter-parser.js');

    // Handle Markdown files
    if (MarkdownParser.isMarkdownFile(file.filePath)) {
      const markdownParser = new MarkdownParser({ maxTokensPerChunk });
      const parsed = markdownParser.parse(file.filePath, file.content);
      if (parsed.isErr()) {
        console.error(`[Indexing] Markdown parsing failed for ${file.filePath}:`, parsed.error);
        return [];
      }
      return [...parsed.value.chunks];
    }

    // Handle source files with Tree-sitter
    const parser = new ExtendedTreeSitterParser();
    const initialized = await parser.initialize();
    if (initialized.isErr()) {
      console.error(`[Indexing] Parser initialization failed for ${file.filePath}:`, initialized.error);
      return [];
    }

    try {
      const parsed = await parser.parse(file.filePath, file.content);
      if (parsed.isErr()) {
        console.warn(`[Indexing] Tree-sitter parsing failed for ${file.filePath}, using text fallback:`, parsed.error.message);

        // Use text-based fallback for files that fail tree-sitter parsing
        const { TextChunker } = await import('@/helpers/source-processor.js');
        const textChunker = new TextChunker(maxTokensPerChunk);
        const textChunked = textChunker.chunk(file.filePath, file.content);

        if (textChunked.isErr()) {
          console.error(`[Indexing] Text chunking also failed for ${file.filePath}:`, textChunked.error);
          return [];
        }

        return [...textChunked.value];
      }

      const chunker = new ASTChunker({ maxTokensPerChunk });
      const chunked = await chunker.chunk(parsed.value);
      if (chunked.isErr()) {
        console.error(`[Indexing] Chunking failed for ${file.filePath}:`, chunked.error);
        return [];
      }

      return [...chunked.value];
    } finally {
      parser.dispose();
    }
  }

  /**
   * Builds the dependency graph from all parsed source files.
   */
  private async buildGraph(
    repositoryPath: string,
    files: ScannedFile[],
  ): Promise<{ graphNodeCount: number; graphEdgeCount: number }> {
    const { GraphBuilder } = await import('@/helpers/core/index.js');
    const { ExtendedTreeSitterParser } = await import('@/helpers/extended-tree-sitter-parser.js');

    const parser = new ExtendedTreeSitterParser();
    const initialized = await parser.initialize();
    if (initialized.isErr()) throw initialized.error;

    const parsedFiles: ParsedFile[] = [];

    try {
      for (const file of files) {
        const { MarkdownParser } = await import('@/helpers/core/index.js');

        // Skip Markdown files for graph building
        if (MarkdownParser.isMarkdownFile(file.filePath)) {
          continue;
        }

        const parsed = await parser.parse(file.filePath, file.content);
        if (parsed.isOk()) {
          parsedFiles.push(parsed.value);
        }
      }

      const graph = new GraphBuilder(repositoryPath).buildFromFiles(parsedFiles);
      if (graph.isErr()) throw graph.error;

      return {
        graphNodeCount: graph.value.nodeCount(),
        graphEdgeCount: graph.value.edgeCount(),
      };
    } finally {
      parser.dispose();
    }
  }
}
