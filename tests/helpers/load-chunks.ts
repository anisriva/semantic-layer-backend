import { QdrantClient } from '@qdrant/js-client-rest';
import type { Chunk, ChunkType } from '@/services/core/index.js';

const CHUNK_TYPES: ChunkType[] = [
  'class',
  'config_block',
  'doc',
  'function',
  'import_block',
  'interface',
  'method',
  'module',
  'type_alias',
];

export async function loadChunks(
  url: string,
  collectionName: string,
  apiKey?: string,
): Promise<Chunk[]> {
  const client = new QdrantClient({ apiKey, checkCompatibility: false, url });
  const chunks: Chunk[] = [];
  let offset: string | number | Record<string, unknown> | undefined;

  do {
    const page = await client.scroll(collectionName, {
      limit: 100,
      offset,
      with_payload: true,
      with_vector: false,
    });
    for (const point of page.points) {
      const payload = point.payload ?? {};
      const id = stringValue(payload['_coderag_id']);
      const content = stringValue(payload['content']);
      const filePath = stringValue(payload['file_path']);
      const chunkType = chunkTypeValue(payload['chunk_type']);
      if (!id || !content || !filePath) continue;
      chunks.push({
        content,
        endLine: numberValue(payload['end_line']),
        filePath,
        id,
        language: stringValue(payload['language']) || 'unknown',
        metadata: {
          chunkType,
          declarations: stringArray(payload['declarations']),
          docTitle: optionalString(payload['doc_title']),
          exports: stringArray(payload['exports']),
          imports: stringArray(payload['imports']),
          links: optionalStringArray(payload['links']),
          name: stringValue(payload['name']) || '(unknown)',
          tags: optionalStringArray(payload['tags']),
        },
        nlSummary: stringValue(payload['nl_summary']),
        startLine: numberValue(payload['start_line']),
      });
    }
    offset = page.next_page_offset ?? undefined;
  } while (offset !== undefined);

  return chunks;
}

function chunkTypeValue(value: unknown): ChunkType {
  return typeof value === 'string' && CHUNK_TYPES.includes(value as ChunkType)
    ? value as ChunkType
    : 'module';
}

function numberValue(value: unknown): number {
  return typeof value === 'number' ? value : 0;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function optionalStringArray(value: unknown): string[] | undefined {
  const values = stringArray(value);
  return values.length > 0 ? values : undefined;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}
