import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getFullAppConfig, getIngestionConfig } from '@/config/index.js';
import { scanFiles } from '@/helpers/file-scanner.js';
import { processSourceFiles } from '@/helpers/source-processor.js';
import { enrichChunks } from '@/helpers/chunk-enrichment.js';
import { createEnrichmentLlm } from '@/helpers/provider-factory.js';

describe('chunk-enrichment helper', () => {
  let rootPath: string;

  beforeEach(async () => {
    rootPath = await mkdtemp(join(tmpdir(), 'chunk-enrichment-'));
  });

  afterEach(async () => {
    await rm(rootPath, { force: true, recursive: true });
  });

  it('attaches a non-empty nlSummary to every chunk without embedding/indexing/retrieval', async () => {
    const sourceDirectory = join(rootPath, 'src');
    await mkdir(sourceDirectory);
    await writeFile(
      join(sourceDirectory, 'greeter.ts'),
      [
        'export function greet(name: string): string {',
        '  return `Hello, ${name}!`;',
        '}',
      ].join('\n'),
    );

    const fullConfig = getFullAppConfig();
    const ingestionConfig = getIngestionConfig(fullConfig);
    const files = await scanFiles(rootPath, ingestionConfig);
    const processed = await processSourceFiles(
      rootPath,
      files,
      ingestionConfig.maxTokensPerChunk,
    );
    expect(processed.chunks.length).toBeGreaterThan(0);

    const enriched = await enrichChunks(processed.chunks, createEnrichmentLlm(fullConfig));

    expect(enriched).toHaveLength(processed.chunks.length);
    for (const chunk of enriched) {
      expect(chunk.nlSummary).toBeTruthy();
      expect(chunk.nlSummary!.length).toBeGreaterThan(0);
    }
  }, 60_000);
});
