import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { computeFileHash, type ScannedFile } from '@/helpers/core/index.js';
import { afterAll, describe, expect, it } from 'vitest';
import { createRagHarness } from './helpers/rag-harness.js';
import { queryIndex } from './helpers/query-index.js';

const indexedChunkIds: string[] = [];
const harness = createRagHarness('semantic-layer-repository-e2e-test');

afterAll(async () => {
  await harness.close(indexedChunkIds);
});

describe('repository RAG pipeline', () => {
  it('processes a supplied file delta, graphs, chunks, enriches, embeds, retrieves, and answers', async () => {
    const repositoryPath = await mkdtemp(join(tmpdir(), 'repository-rag-e2e-'));
    try {
      const sourceDirectory = join(repositoryPath, 'src');
      const invoicePath = join(sourceDirectory, 'invoice.ts');
      const indexPath = join(sourceDirectory, 'index.ts');
      await mkdir(sourceDirectory);
      await writeFile(invoicePath, [
        'export function calculateInvoiceTotal(amounts: number[]): number {',
        '  return amounts.reduce((total, amount) => total + amount, 0);',
        '}',
      ].join('\n'));
      await writeFile(indexPath, "export { calculateInvoiceTotal } from './invoice.js';\n");

      const files: ScannedFile[] = await Promise.all([
        toScannedFile('src/invoice.ts', invoicePath),
        toScannedFile('src/index.ts', indexPath),
      ]);
      const result = await harness.run(
        repositoryPath,
        files,
        'Which function calculates the invoice total?',
      );
      indexedChunkIds.push(...result.chunkIds);
      console.log(JSON.stringify({ answer: result.answer, stage: 'TEST_ANSWER' }, null, 2));

      const pointCount = await harness.count();
      console.log(JSON.stringify({ pointCount, stage: 'QDRANT_POINTS' }, null, 2));
      expect(pointCount).toBeGreaterThanOrEqual(result.chunkIds.length);

      const queryOnlyResult = await queryIndex(
        'semantic-layer-repository-e2e-test',
        'Where is invoice total calculation implemented?',
      );
      console.log(JSON.stringify({ answer: queryOnlyResult.answer, stage: 'QUERY_ONLY_ANSWER' }, null, 2));
      expect(queryOnlyResult.indexedChunkCount).toBeGreaterThanOrEqual(result.chunkIds.length);
      expect(queryOnlyResult.answer.length).toBeGreaterThan(0);

      expect(result.metrics).toMatchObject({
        chunkCount: 2,
        enrichedChunkCount: 2,
        fileCount: 2,
        graphEdgeCount: 1,
        graphNodeCount: 2,
      });
      expect(result.results[0]?.content).toContain('calculateInvoiceTotal');
      expect(result.answer.length).toBeGreaterThan(0);
    } finally {
      await rm(repositoryPath, { force: true, recursive: true });
    }
  }, 120_000);
});

async function toScannedFile(filePath: string, absolutePath: string): Promise<ScannedFile> {
  const content = await readFile(absolutePath, 'utf8');
  return { content, contentHash: computeFileHash(content), filePath };
}
