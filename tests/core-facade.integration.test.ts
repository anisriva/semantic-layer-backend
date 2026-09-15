import * as core from '@/services/core/index.js';
import { getEmbeddingModelConfig, getFullAppConfig } from '@/config/index.js';
import { describe, expect, it } from 'vitest';

describe('CodeRAG core facade', () => {
  it('exposes the required package-backed capabilities', () => {
    expect(core.TreeSitterParser).toBeTypeOf('function');
    expect(core.ASTChunker).toBeTypeOf('function');
    expect(core.FileScanner).toBeTypeOf('function');
    expect(core.IncrementalIndexer).toBeTypeOf('function');
    expect(core.QdrantVectorStore).toBeTypeOf('function');
    expect(core.HybridSearch).toBeTypeOf('function');
    expect(core.ConfluenceProvider).toBeTypeOf('function');
    expect(core.confluenceStorageToPlainText('<p>Architecture guide</p>')).toContain('Architecture guide');
  });

  it('does not expose provider-specific Ollama lifecycle APIs', () => {
    expect('OllamaEmbeddingProvider' in core).toBe(false);
    expect('ModelLifecycleManager' in core).toBe(false);
    expect('OllamaClient' in core).toBe(false);
  });

  it('embeds through the configured OpenAI-compatible endpoint', async () => {
    const fullConfig = getFullAppConfig();
    const embeddingConfig = getEmbeddingModelConfig(fullConfig);
    const provider = new core.OpenAICompatibleEmbeddingProvider(embeddingConfig);

    const result = await provider.embed(['model-agnostic semantic search']);
    expect(result.isOk(), result.isErr() ? result.error.message : '').toBe(true);
    if (result.isErr()) return;
    expect(result.value[0]).toHaveLength(embeddingConfig.dimensions);
  });
});
