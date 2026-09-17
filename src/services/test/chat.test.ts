import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { QdrantClient } from '@qdrant/js-client-rest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getFullAppConfig } from '@/config/index.js';
import { ChatService } from '@/services/chat.js';
import { IndexingService } from '@/services/indexing.js';
import { NotIndexedError, SearchService } from '@/services/search.js';
import { withLocallyReachableAnswerModel } from './locally-reachable-config.js';

const COLLECTION_NAME = 'semantic-layer-phase1-chat-test';

afterAll(async () => {
  const client = new QdrantClient({ checkCompatibility: false, url: getFullAppConfig().app.ragDb.qdrant.url });
  await client.deleteCollection(COLLECTION_NAME);
});

describe('ChatService', () => {
  // The configured answer model targets an external endpoint that this
  // environment's network policy blocks; route the answer role to the
  // locally reachable enrichment endpoint so the test exercises every real
  // integration point it can reach.
  const fullConfig = withLocallyReachableAnswerModel(getFullAppConfig());
  const chatService = new ChatService(new SearchService(fullConfig), fullConfig);

  it('propagates NotIndexedError for an unindexed collection', async () => {
    await expect(
      chatService.ask('semantic-layer-phase1-chat-missing', 'anything'),
    ).rejects.toBeInstanceOf(NotIndexedError);
  });

  describe('against an already-indexed collection', () => {
    beforeAll(async () => {
      const rootPath = await mkdtemp(join(tmpdir(), 'chat-service-'));
      try {
        const sourceDirectory = join(rootPath, 'src');
        await mkdir(sourceDirectory);
        await writeFile(
          join(sourceDirectory, 'shipping.ts'),
          [
            'export function calculateShippingCost(weightKg: number): number {',
            '  return weightKg * 4.5;',
            '}',
          ].join('\n'),
        );
        await new IndexingService().indexPath(rootPath, COLLECTION_NAME);
      } finally {
        await rm(rootPath, { force: true, recursive: true });
      }
    }, 120_000);

    it('answers a scope-bound question with source file references', async () => {
      const result = await chatService.ask(COLLECTION_NAME, 'Which function calculates shipping cost?');

      expect(result.answer.length).toBeGreaterThan(0);
      expect(result.sources.length).toBeGreaterThan(0);
      expect(result.sources.some((source) => source.filePath.includes('shipping.ts'))).toBe(true);
    }, 60_000);

    it('streams a scope-bound answer token-by-token via askStream', async () => {
      const result = await chatService.askStream(COLLECTION_NAME, 'Which function calculates shipping cost?');

      expect(result.sources.length).toBeGreaterThan(0);
      expect(result.sources.some((source) => source.filePath.includes('shipping.ts'))).toBe(true);

      const chunks: string[] = [];
      for await (const chunk of result.textStream) {
        chunks.push(chunk);
      }

      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks.join('').length).toBeGreaterThan(0);
    }, 60_000);
  });
});
