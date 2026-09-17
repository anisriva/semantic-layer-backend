import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { QdrantClient } from '@qdrant/js-client-rest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getFullAppConfig } from '@/config/index.js';
import { ChatService } from '@/services/chat.js';
import { SearchService } from '@/services/search.js';
import { IndexingService } from '@/services/indexing.js';
import { RepositoryService } from '@/services/repository.js';
import { ConversationService } from '@/services/conversation.js';
import { withLocallyReachableAnswerModel } from './locally-reachable-config.js';
import type { Repository } from '@prisma/client';

describe('ConversationService — SSE streaming (askQuestionStream)', () => {
  // Same rationale as chat.test.ts: route the answer role to the locally
  // reachable enrichment endpoint in case this environment's network policy
  // blocks the externally configured answer endpoint.
  const fullConfig = withLocallyReachableAnswerModel(getFullAppConfig());
  const chatService = new ChatService(new SearchService(fullConfig), fullConfig);
  const conversationService = new ConversationService(undefined, undefined, undefined, chatService);
  const repositoryService = new RepositoryService();

  let repository: Repository;
  let collectionName: string;
  let rootPath: string;

  beforeAll(async () => {
    rootPath = await mkdtemp(join(tmpdir(), 'conversation-service-'));
    const sourceDirectory = join(rootPath, 'src');
    await mkdir(sourceDirectory);
    await writeFile(
      join(sourceDirectory, 'discount.ts'),
      [
        'export function calculateDiscount(price: number, percentOff: number): number {',
        '  return price * (1 - percentOff / 100);',
        '}',
      ].join('\n'),
    );

    repository = await repositoryService.createRepository({
      name: `conversation-test-${Date.now()}`,
      sourceType: 'LOCAL',
      localPath: rootPath,
    });

    // The worker derives the collection name as `repo-${repository.id}`
    // (src/worker.ts) — Phase 4 replaces this with the deterministic
    // `getCollectionName` helper, but that helper does not exist yet.
    collectionName = `repo-${repository.id}`;
    await new IndexingService().indexPath(rootPath, collectionName);
  }, 120_000);

  afterAll(async () => {
    await repositoryService.deleteRepository(repository.id).catch(() => undefined);
    await rm(rootPath, { force: true, recursive: true });
    const client = new QdrantClient({ checkCompatibility: false, url: getFullAppConfig().app.ragDb.qdrant.url });
    await client.deleteCollection(collectionName).catch(() => undefined);
  });

  it('persists the user message immediately and the assistant message after streaming completes', async () => {
    const conversation = await conversationService.createConversation({
      repositoryId: repository.id,
      userId: repository.owner_id,
      title: 'Discount question',
    });

    const chunks: string[] = [];
    for await (const chunk of conversationService.askQuestionStream(
      conversation.id,
      'Which function calculates a discount?',
      collectionName,
    )) {
      chunks.push(chunk);
    }

    expect(chunks.length).toBeGreaterThan(0);
    const fullAnswer = chunks.join('');
    expect(fullAnswer.length).toBeGreaterThan(0);

    const messages = await conversationService.listMessages(conversation.id);
    expect(messages).toHaveLength(2);
    expect(messages[0]?.role).toBe('user');
    expect(messages[0]?.content).toBe('Which function calculates a discount?');
    expect(messages[1]?.role).toBe('assistant');
    expect(messages[1]?.content).toBe(fullAnswer);
  }, 60_000);

  it('rejects streaming against a nonexistent conversation', async () => {
    const iterate = async () => {
      for await (const _chunk of conversationService.askQuestionStream(
        'nonexistent-conversation-id',
        'anything',
        collectionName,
      )) {
        // no-op
      }
    };

    await expect(iterate()).rejects.toThrow('Conversation not found');
  });
});
