/**
 * Guards against configuration drift and hardcoding: every key defined in
 * `config/app.yaml` and `config/prompts.yaml` must be validated by its Zod
 * schema, assembled into `getFullAppConfig()`/`getPromptsConfig()`, and
 * reachable through a typed getter (`@/config/index.js`). Helpers/services
 * must source these values through the getters instead of hardcoding
 * defaults for anything the YAML files already define.
 */
import { describe, expect, it } from 'vitest';
import {
  getAnswerModelConfig,
  getEmbeddingModelConfig,
  getEnrichmentModelConfig,
  getFullAppConfig,
  getIngestionConfig,
  getModelsConfig,
  getPostgresConfig,
  getPromptsConfig,
  getQdrantConfig,
  getRagPipelineConfig,
  getRetrievalConfig,
  getServerConfig,
  getWorkerConfig,
  renderPrompt,
  validateAppConfig,
} from '@/config/index.js';
import { promptsConfigSchema } from '@/types/config/prompts-config.schema.js';
import { loadAppConfig, loadPromptsConfig } from '@/utils/yaml-loader.js';

/** Recursively collects dot-separated leaf key paths from a nested object (arrays count as leaves). */
function collectLeafPaths(value: unknown, prefix = ''): string[] {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return prefix ? [prefix] : [];
  }
  return Object.entries(value as Record<string, unknown>).flatMap(([key, nested]) =>
    collectLeafPaths(nested, prefix ? `${prefix}.${key}` : key),
  );
}

function getAtPath(value: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((current, part) => {
    if (current && typeof current === 'object' && part in current) {
      return (current as Record<string, unknown>)[part];
    }
    return undefined;
  }, value);
}

describe('app.yaml exposure', () => {
  const rawYaml = loadAppConfig();
  const fullConfig = getFullAppConfig();

  it('validates against the app config schema', () => {
    expect(() => validateAppConfig(rawYaml)).not.toThrow();
  });

  it.each(collectLeafPaths(rawYaml))('exposes app.yaml key "%s" via getFullAppConfig()', (path) => {
    expect(getAtPath(fullConfig, path)).toBeDefined();
  });

  it('exposes ragPipeline.ingestion settings with the expected shape via getIngestionConfig', () => {
    const ingestionConfig = getIngestionConfig(fullConfig);
    expect(ingestionConfig.concurrency).toBeGreaterThan(0);
    expect(ingestionConfig.enrichmentConcurrency).toBeGreaterThan(0);
    expect(ingestionConfig.embeddingConcurrency).toBeGreaterThan(0);
    expect(Array.isArray(ingestionConfig.excludePatterns)).toBe(true);
    expect(ingestionConfig.excludePatterns.length).toBeGreaterThan(0);
    expect(ingestionConfig.excludePatterns.some((pattern) => pattern.includes('node_modules'))).toBe(true);
  });

  it('exposes every top-level and nested section via a dedicated getter', () => {
    expect(getServerConfig(fullConfig)).toBe(fullConfig.app);
    expect(getModelsConfig(fullConfig)).toBe(fullConfig.models);
    expect(getRagPipelineConfig(fullConfig)).toBe(fullConfig.ragPipeline);
    expect(getEmbeddingModelConfig(fullConfig)).toBe(fullConfig.models.embedding);
    expect(getEnrichmentModelConfig(fullConfig)).toBe(fullConfig.models.enrichment);
    expect(getAnswerModelConfig(fullConfig)).toBe(fullConfig.models.answer);
    expect(getIngestionConfig(fullConfig)).toBe(fullConfig.ragPipeline.ingestion);
    expect(getRetrievalConfig(fullConfig)).toBe(fullConfig.ragPipeline.retrieval);
    expect(getWorkerConfig(fullConfig)).toBe(fullConfig.app.worker);
    expect(getQdrantConfig(fullConfig)).toBe(fullConfig.app.ragDb.qdrant);
    expect(getPostgresConfig(fullConfig)).toBe(fullConfig.app.appDb.postgres);
  });
});

describe('prompts.yaml exposure', () => {
  const rawYaml = loadPromptsConfig();
  const promptsConfig = getPromptsConfig();

  it('validates against the prompts config schema', () => {
    expect(() => promptsConfigSchema.parse(rawYaml)).not.toThrow();
  });

  it.each(collectLeafPaths(rawYaml))('exposes prompts.yaml template "%s" via getPromptsConfig()', (path) => {
    expect(getAtPath(promptsConfig, path)).toBeDefined();
  });

  it.each(collectLeafPaths(rawYaml))('renders template "%s" through renderPrompt without throwing', (path) => {
    expect(() => renderPrompt(path, {})).not.toThrow();
  });
});
