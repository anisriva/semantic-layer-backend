import { describe, expect, it } from 'vitest';
import {
  ASTChunker,
  MarkdownParser,
  TreeSitterParser,
  type ConfluencePage,
} from '@/services/core/index.js';
import { confluencePagesToChunks } from './helpers/confluence-pages.js';

describe('CodeRAG parser and chunker integration', () => {
  it('parses TypeScript declarations and creates semantic chunks', async () => {
    const source = [
      "import { randomUUID } from 'node:crypto';",
      '',
      'export interface Repository {',
      '  id: string;',
      '}',
      '',
      'export function createRepository(): Repository {',
      '  return { id: randomUUID() };',
      '}',
    ].join('\n');
    const parser = new TreeSitterParser();

    const initialization = await parser.initialize();
    expect(initialization.isOk()).toBe(true);

    const parsed = await parser.parse('src/repository.ts', source);
    expect(parsed.isOk()).toBe(true);
    if (parsed.isErr()) return;
    expect(parsed.value.declarations).toEqual(['Repository', 'createRepository']);

    const chunker = new ASTChunker({ maxTokensPerChunk: 512 });
    const chunked = await chunker.chunk(parsed.value);
    expect(chunked.isOk()).toBe(true);
    if (chunked.isErr()) return;
    expect(chunked.value.some((chunk) => chunk.metadata.chunkType === 'interface')).toBe(true);
    expect(chunked.value.some((chunk) => chunk.metadata.declarations.includes('createRepository'))).toBe(true);

    parser.dispose();
  });

  it('parses Markdown sections into documentation chunks', () => {
    const source = [
      '---',
      'title: Setup Guide',
      'tags: [setup, rag]',
      '---',
      '',
      '# Indexing',
      '',
      'Run the indexing pipeline and see [[Search Guide]].',
    ].join('\n');
    const parser = new MarkdownParser({ maxTokensPerChunk: 512 });

    const parsed = parser.parse('docs/setup.md', source);
    expect(parsed.isOk()).toBe(true);
    if (parsed.isErr()) return;
    expect(parsed.value.chunks).toHaveLength(1);
    expect(parsed.value.chunks[0]?.metadata).toMatchObject({
      chunkType: 'doc',
      docTitle: 'Setup Guide',
      links: ['Search Guide'],
      tags: ['setup', 'rag'],
    });
  });

  it('converts Confluence pages into documentation chunks', () => {
    const page: ConfluencePage = {
      id: 'architecture',
      labels: ['design', 'rag'],
      lastModified: new Date('2026-01-01T00:00:00Z'),
      metadata: {},
      plainText: '# Services\n\nServices orchestrate application behavior.',
      spaceKey: 'ENG',
      storageFormat: '<h1>Services</h1><p>Services orchestrate application behavior.</p>',
      title: 'Backend Architecture',
      type: 'page',
      url: 'https://example.invalid/wiki/architecture',
      version: 1,
    };

    const chunks = confluencePagesToChunks([page], 512);

    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.filePath).toBe('confluence://ENG/architecture.md');
    expect(chunks[0]?.metadata).toMatchObject({
      chunkType: 'doc',
      docTitle: 'Backend Architecture',
      tags: ['design', 'rag'],
    });
  });
});
