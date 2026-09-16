#!/usr/bin/env node
/**
 * Script to index the tesseract-orchestrator repository
 */
import { IndexingService } from '@/services/indexing.js';

const COLLECTION_NAME = 'erpc-product-tenant-v1';
const REPO_PATH = '/Users/4275019/repos/work/erpc/centrum/erpc-product-tenant-v1/';

async function main() {
  console.log(`Starting indexing of ${REPO_PATH} into collection "${COLLECTION_NAME}"...`);
  
  const service = new IndexingService();
  
  try {
    const result = await service.indexPath(REPO_PATH, COLLECTION_NAME);
    
    console.log('Indexing completed successfully!');
    console.log('Results:', {
      fileCount: result.fileCount,
      chunkCount: result.chunkCount,
      enrichedChunkCount: result.enrichedChunkCount,
      graphNodeCount: result.graphNodeCount,
      graphEdgeCount: result.graphEdgeCount,
      durationMs: result.durationMs,
      durationSeconds: (result.durationMs / 1000).toFixed(2),
    });
  } catch (error) {
    console.error('Indexing failed:', error);
    process.exit(1);
  }
}

main();