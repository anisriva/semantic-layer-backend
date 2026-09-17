/**
 * Helper: collection-reset
 *
 * Drops a Qdrant collection outright so a full re-scan starts from a clean
 * slate. Used by the worker before a full-scan `REFRESH` (e.g. `LOCAL`
 * sources, which have no git history to diff and therefore cannot delete
 * only the chunks belonging to removed/renamed files — Section 8.5/9.7).
 *
 * Uses `@qdrant/js-client-rest` directly (already a project dependency,
 * the same client CodeRAG's own `QdrantVectorStore` wraps internally, and
 * already used this way in `src/services/test/*.test.ts` for cleanup)
 * rather than adding a parallel vector-store implementation: this is
 * collection lifecycle management, not chunking/embedding/retrieval logic.
 */
import { QdrantClient } from '@qdrant/js-client-rest';
import { getQdrantConfig, getFullAppConfig, type FullAppConfig } from '@/config/index.js';

/**
 * Deletes `collectionName` if it exists. `IndexingService.indexPath`'s
 * subsequent `initializeVectorStore` call recreates it automatically on
 * first connect (via CodeRAG's `QdrantVectorStore.connect()`), so no
 * explicit re-creation is needed here.
 */
export async function resetCollection(
  collectionName: string,
  fullConfig: FullAppConfig = getFullAppConfig(),
): Promise<void> {
  const qdrantConfig = getQdrantConfig(fullConfig);
  const client = new QdrantClient({ url: qdrantConfig.url, checkCompatibility: false });

  const existing = await client.collectionExists(collectionName);
  if (!existing.exists) {
    return;
  }

  await client.deleteCollection(collectionName);
}
