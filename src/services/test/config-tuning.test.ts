import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { QdrantClient } from '@qdrant/js-client-rest';
import { afterAll, describe, expect, it } from 'vitest';
import { getFullAppConfig, getIngestionConfig, getRetrievalConfig, type FullAppConfig } from '@/config/index.js';
import { HybridSearch } from '@/helpers/core/index.js';
import { scanFiles } from '@/helpers/file-scanner.js';
import { processSourceFiles } from '@/helpers/source-processor.js';
import { enrichChunks } from '@/helpers/chunk-enrichment.js';
import { indexChunks } from '@/helpers/chunk-indexer.js';
import { retrieve } from '@/helpers/hybrid-retriever.js';
import { createCollectionProviders, createEnrichmentLlm } from '@/helpers/provider-factory.js';

const COLLECTION_NAME = 'semantic-layer-phase1-config-tuning-test';

function withIngestion(maxTokensPerChunk: number): FullAppConfig {
  const fullConfig = getFullAppConfig();
  return {
    ...fullConfig,
    ragPipeline: {
      ...fullConfig.ragPipeline,
      ingestion: { ...fullConfig.ragPipeline.ingestion, maxTokensPerChunk },
    },
  };
}

function withRetrieval(overrides: Partial<ReturnType<typeof getRetrievalConfig>>): FullAppConfig {
  const fullConfig = getFullAppConfig();
  return {
    ...fullConfig,
    ragPipeline: {
      ...fullConfig.ragPipeline,
      retrieval: { ...fullConfig.ragPipeline.retrieval, ...overrides },
    },
  };
}

describe('ingestion config tuning', () => {
  const REPEATED_FUNCTION_SOURCE = Array.from({ length: 8 }, (_, index) => [
    `export function computeStep${index}(value: number): number {`,
    `  return value * ${index + 1} + ${index};`,
    '}',
  ].join('\n')).join('\n\n');

  it.each([
    { maxTokensPerChunk: 32 },
    { maxTokensPerChunk: 512 },
  ])(
    'produces chunk counts consistent with maxTokensPerChunk=$maxTokensPerChunk',
    async ({ maxTokensPerChunk }) => {
      const rootPath = await mkdtemp(join(tmpdir(), 'config-tuning-ingestion-'));
      try {
        await writeFile(join(rootPath, 'steps.ts'), REPEATED_FUNCTION_SOURCE);
        const fullConfig = withIngestion(maxTokensPerChunk);
        const ingestionConfig = getIngestionConfig(fullConfig);
        const files = await scanFiles(rootPath, ingestionConfig);
        const processed = await processSourceFiles(
          rootPath,
          files,
          ingestionConfig.maxTokensPerChunk,
        );
        expect(processed.chunks.length).toBeGreaterThan(0);
      } finally {
        await rm(rootPath, { force: true, recursive: true });
      }
    },
    30_000,
  );

  it('produces at least as many chunks with a smaller maxTokensPerChunk budget', async () => {
    const rootPath = await mkdtemp(join(tmpdir(), 'config-tuning-ingestion-compare-'));
    try {
      const sourceDirectory = join(rootPath, 'src');
      await mkdir(sourceDirectory);
      await writeFile(join(sourceDirectory, 'steps.ts'), REPEATED_FUNCTION_SOURCE);
      const files = await scanFiles(rootPath, getIngestionConfig(getFullAppConfig()));

      const small = await processSourceFiles(rootPath, files, 16);
      const large = await processSourceFiles(rootPath, files, 4096);

      expect(small.chunks.length).toBeGreaterThanOrEqual(large.chunks.length);
    } finally {
      await rm(rootPath, { force: true, recursive: true });
    }
  }, 30_000);
});

describe('retrieval config tuning', () => {
  afterAll(async () => {
    const client = new QdrantClient({ checkCompatibility: false, url: getFullAppConfig().app.ragDb.qdrant.url });
    await client.deleteCollection(COLLECTION_NAME);
  });

  it.each([
    { topK: 1 },
    { topK: 3 },
  ])('honors topK=$topK when returning search results', async ({ topK }) => {
    const rootPath = await mkdtemp(join(tmpdir(), 'config-tuning-retrieval-'));
    try {
      const sourceDirectory = join(rootPath, 'src');
      await mkdir(sourceDirectory);
      for (let index = 0; index < 5; index += 1) {
        await writeFile(
          join(sourceDirectory, `handler-${index}.ts`),
          [
            `export function handleRequest${index}(payload: unknown): unknown {`,
            '  return payload;',
            '}',
          ].join('\n'),
        );
      }
      const fullConfig = getFullAppConfig();
      const ingestionConfig = getIngestionConfig(fullConfig);
      const files = await scanFiles(rootPath, ingestionConfig);
      const processed = await processSourceFiles(rootPath, files, ingestionConfig.maxTokensPerChunk);
      const enriched = await enrichChunks(processed.chunks, createEnrichmentLlm(fullConfig));
      const { embeddingProvider, vectorStore, bm25Index } = createCollectionProviders(COLLECTION_NAME, fullConfig);
      try {
        await indexChunks(enriched, embeddingProvider, vectorStore, bm25Index);
        const retrievalConfig = withRetrieval({}).ragPipeline.retrieval;
        const search = new HybridSearch(vectorStore, bm25Index, embeddingProvider, retrievalConfig);
        const results = await retrieve('Which function handles the request?', search, topK);
        expect(results.length).toBeLessThanOrEqual(topK);
        expect(results.length).toBeGreaterThan(0);
      } finally {
        vectorStore.close();
      }
    } finally {
      await rm(rootPath, { force: true, recursive: true });
    }
  }, 120_000);

  it.each([
    { bm25Weight: 0.9, vectorWeight: 0.1 },
    { bm25Weight: 0.1, vectorWeight: 0.9 },
  ])(
    'runs hybrid search with vectorWeight=$vectorWeight and bm25Weight=$bm25Weight without error',
    async ({ bm25Weight, vectorWeight }) => {
      const rootPath = await mkdtemp(join(tmpdir(), 'config-tuning-weights-'));
      try {
        const sourceDirectory = join(rootPath, 'src');
        await mkdir(sourceDirectory);
        await writeFile(
          join(sourceDirectory, 'search-target.ts'),
          [
            'export function locateWarehouseItem(sku: string): string {',
            '  return `located:${sku}`;',
            '}',
          ].join('\n'),
        );
        const fullConfig = getFullAppConfig();
        const ingestionConfig = getIngestionConfig(fullConfig);
        const files = await scanFiles(rootPath, ingestionConfig);
        const processed = await processSourceFiles(rootPath, files, ingestionConfig.maxTokensPerChunk);
        const enriched = await enrichChunks(processed.chunks, createEnrichmentLlm(fullConfig));
        const { embeddingProvider, vectorStore, bm25Index } = createCollectionProviders(
          `${COLLECTION_NAME}-weights`,
          fullConfig,
        );
        try {
          await indexChunks(enriched, embeddingProvider, vectorStore, bm25Index);
          const retrievalConfig = withRetrieval({ bm25Weight, vectorWeight }).ragPipeline.retrieval;
          const search = new HybridSearch(vectorStore, bm25Index, embeddingProvider, retrievalConfig);
          const results = await retrieve('Which function locates a warehouse item?', search, 5);
          expect(results.length).toBeGreaterThan(0);
        } finally {
          vectorStore.close();
          const client = new QdrantClient({
            checkCompatibility: false,
            url: fullConfig.app.ragDb.qdrant.url,
          });
          await client.deleteCollection(`${COLLECTION_NAME}-weights`);
        }
      } finally {
        await rm(rootPath, { force: true, recursive: true });
      }
    },
    120_000,
  );
});
