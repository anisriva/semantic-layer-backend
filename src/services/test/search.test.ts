import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { QdrantClient } from '@qdrant/js-client-rest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getFullAppConfig } from '@/config/index.js';
import { IndexingService } from '@/services/indexing.js';
import { NotIndexedError, SearchService } from '@/services/search.js';

const COLLECTION_NAME = 'semantic-layer-phase1-search-test';

afterAll(async () => {
  const client = new QdrantClient({ checkCompatibility: false, url: getFullAppConfig().app.ragDb.qdrant.url });
  await client.deleteCollection(COLLECTION_NAME);
});

describe('SearchService', () => {
  const searchService = new SearchService();

  it('throws NotIndexedError against a collection with no indexed points', async () => {
    await expect(
      searchService.search('semantic-layer-phase1-search-missing', 'anything'),
    ).rejects.toBeInstanceOf(NotIndexedError);
  });

  describe('against an already-indexed collection', () => {
    beforeAll(async () => {
      const rootPath = await mkdtemp(join(tmpdir(), 'search-service-'));
      try {
        const sourceDirectory = join(rootPath, 'src');
        await mkdir(sourceDirectory);
        await writeFile(
          join(sourceDirectory, 'tax.ts'),
          [
            'export function calculateSalesTax(amount: number, rate: number): number {',
            '  return amount * rate;',
            '}',
          ].join('\n'),
        );
        await new IndexingService().indexPath(rootPath, COLLECTION_NAME);
      } finally {
        await rm(rootPath, { force: true, recursive: true });
      }
    }, 120_000);

    it('returns non-empty results without re-running ingestion', async () => {
      const results = await searchService.search(COLLECTION_NAME, 'Which function calculates sales tax?');

      expect(results.length).toBeGreaterThan(0);
      expect(results.some((result) => result.content.includes('calculateSalesTax'))).toBe(true);
    }, 60_000);
  });
});
