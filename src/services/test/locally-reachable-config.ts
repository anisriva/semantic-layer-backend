import type { FullAppConfig } from '@/config/index.js';

/**
 * Test-only config override: points the answer-role model at the same
 * locally reachable endpoint configured for enrichment. Some test/CI
 * networks block the externally configured answer endpoint (e.g. corporate
 * URL filtering), which would otherwise fail every answer-generation
 * assertion for reasons unrelated to the code under test.
 */
export function withLocallyReachableAnswerModel(fullConfig: FullAppConfig): FullAppConfig {
  return {
    ...fullConfig,
    models: {
      ...fullConfig.models,
      answer: { ...fullConfig.models.enrichment },
    },
  };
}
