import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { QdrantClient } from '@qdrant/js-client-rest';
import { afterAll, describe, expect, it } from 'vitest';
import { getFullAppConfig } from '@/config/index.js';
import { ChatService } from '@/services/chat.js';
import { IndexingService } from '@/services/indexing.js';
import { SearchService } from '@/services/search.js';
import { withLocallyReachableAnswerModel } from './locally-reachable-config.js';

const COLLECTION_NAME = 'semantic-layer-phase1-full-pipeline-test';

afterAll(async () => {
  const client = new QdrantClient({ checkCompatibility: false, url: getFullAppConfig().app.ragDb.qdrant.url });
  await client.deleteCollection(COLLECTION_NAME);
});

describe('local-folder-in, answer-out pipeline', () => {
  it('indexes a local folder end to end and answers a question against it', async () => {
    const rootPath = await mkdtemp(join(tmpdir(), 'full-pipeline-'));
    try {
      const sourceDirectory = join(rootPath, 'src');
      const inventoryPath = join(sourceDirectory, 'inventory.ts');
      const indexPath = join(sourceDirectory, 'index.ts');
      await mkdir(sourceDirectory);
      await writeFile(
        inventoryPath,
        [
          'export function isLowStock(quantity: number, threshold: number): boolean {',
          '  return quantity < threshold;',
          '}',
        ].join('\n'),
      );
      await writeFile(indexPath, "export { isLowStock } from './inventory.js';\n");
      await writeFile(join(rootPath, 'README.md'), '# Inventory\n\nTracks stock levels and low-stock alerts.\n');

      const indexingService = new IndexingService();
      const indexResult = await indexingService.indexPath(rootPath, COLLECTION_NAME);

      expect(indexResult.fileCount).toBe(3);
      expect(indexResult.chunkCount).toBeGreaterThan(0);
      expect(indexResult.enrichedChunkCount).toBe(indexResult.chunkCount);
      expect(indexResult.graphNodeCount).toBeGreaterThan(0);
      expect(indexResult.graphEdgeCount).toBeGreaterThan(0);

      // The configured answer model targets an external endpoint that this
      // environment's network policy blocks; route the answer role to the
      // locally reachable enrichment endpoint so the test exercises every
      // real integration point it can reach.
      const fullConfig = withLocallyReachableAnswerModel(getFullAppConfig());
      const searchService = new SearchService(fullConfig);
      const searchResults = await searchService.search(COLLECTION_NAME, 'Which function checks for low stock?');
      expect(searchResults.length).toBeGreaterThan(0);

      const chatService = new ChatService(searchService, fullConfig);
      const chatAnswer = await chatService.ask(COLLECTION_NAME, 'Which function checks for low stock?');
      expect(chatAnswer.answer.length).toBeGreaterThan(0);
      expect(chatAnswer.sources.length).toBeGreaterThan(0);
      expect(chatAnswer.sources.some((source) => source.filePath.includes('inventory.ts'))).toBe(true);
    } finally {
      await rm(rootPath, { force: true, recursive: true });
    }
  }, 180_000);
});
