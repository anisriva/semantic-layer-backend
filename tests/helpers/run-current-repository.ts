import { resolve } from 'node:path';
import {
  getFullAppConfig,
  getIngestionConfig,
} from '@/config/index.js';
import { createRagHarness } from './rag-harness.js';
import { selectFiles } from './select-files.js';

const fullConfig = getFullAppConfig();
const repositoryPath = resolve(process.cwd());
const question = process.argv.slice(2).join(' ')
  || 'How does this backend separate service orchestration, helper implementation, and CodeRAG core integration?';
const files = await selectFiles(repositoryPath, getIngestionConfig(fullConfig).excludePatterns);
const harness = createRagHarness('semantic-layer-backend-verification');

try {
  const result = await harness.run(repositoryPath, files, question);
  console.log(JSON.stringify({
    answer: result.answer,
    level: 'info',
    message: 'Current repository RAG verification succeeded',
    metrics: result.metrics,
    sources: result.results.map((item) => ({
      filePath: item.chunk?.filePath ?? 'unknown',
      score: item.score,
    })),
    stage: 'SUMMARY',
    timestamp: new Date().toISOString(),
  }, null, 2));
} finally {
  await harness.close();
}
