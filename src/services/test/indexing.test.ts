import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { QdrantClient } from '@qdrant/js-client-rest';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getFullAppConfig } from '@/config/index.js';
import { createVectorStore } from '@/helpers/provider-factory.js';
import { IndexingService } from '@/services/indexing.js';

const COLLECTION_NAME = 'semantic-layer-phase1-indexing-test';
let pointsWereCreated = false;

afterAll(async () => {
  expect(pointsWereCreated).toBe(true);
  const client = new QdrantClient({ checkCompatibility: false, url: getFullAppConfig().app.ragDb.qdrant.url });
  await client.deleteCollection(COLLECTION_NAME);
});

describe('IndexingService', () => {
  const service = new IndexingService();
  let rootPath: string;

  beforeEach(async () => {
    rootPath = await mkdtemp(join(tmpdir(), 'indexing-service-'));
  });

  afterEach(async () => {
    await rm(rootPath, { force: true, recursive: true });
  });

  it('scans, processes, enriches, and indexes a local folder, reporting pipeline metrics', async () => {
    const sourceDirectory = join(rootPath, 'src');
    await mkdir(sourceDirectory);
    await writeFile(
      join(sourceDirectory, 'discount.ts'),
      [
        'export function applyDiscount(price: number, percent: number): number {',
        '  return price - (price * percent) / 100;',
        '}',
      ].join('\n'),
    );
    await writeFile(join(rootPath, 'README.md'), '# Discount Service\n\nApplies percentage discounts.\n');

    const result = await service.indexPath(rootPath, COLLECTION_NAME);

    expect(result.fileCount).toBe(2);
    expect(result.chunkCount).toBeGreaterThan(0);
    expect(result.enrichedChunkCount).toBe(result.chunkCount);
    expect(result.graphNodeCount).toBeGreaterThan(0);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);

    const vectorStore = createVectorStore(COLLECTION_NAME);
    const count = await vectorStore.count();
    vectorStore.close();
    if (count.isErr()) throw count.error;
    expect(count.value).toBeGreaterThanOrEqual(result.chunkCount);
    pointsWereCreated = count.value > 0;
  }, 120_000);

  it('returns a zero-count result for an empty file set instead of throwing', async () => {
    const result = await service.indexPath(rootPath, COLLECTION_NAME);

    expect(result).toEqual({
      chunkCount: 0,
      durationMs: expect.any(Number),
      enrichedChunkCount: 0,
      fileCount: 0,
      graphEdgeCount: 0,
      graphNodeCount: 0,
    });
  });
});
