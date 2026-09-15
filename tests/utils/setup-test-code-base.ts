import { existsSync, mkdirSync, copyFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export function setupTestCodeBase(): void {
  const fixtureRoot = join(process.cwd(), '.helpers', 'test-code-base');

  // Create directory structure
  const directories = [
    join(fixtureRoot, 'src'),
    join(fixtureRoot, 'src', 'config'),
    join(fixtureRoot, 'src', 'helpers'),
    join(fixtureRoot, 'src', 'helpers', 'core'),
    join(fixtureRoot, 'src', 'services'),
    join(fixtureRoot, 'src', 'types'),
    join(fixtureRoot, 'src', 'types', 'config'),
    join(fixtureRoot, 'src', 'utils'),
    join(fixtureRoot, 'src', 'models'),
    join(fixtureRoot, 'src', 'daos'),
    join(fixtureRoot, 'src', 'connectors'),
    join(fixtureRoot, 'docs'),
    join(fixtureRoot, 'scripts'),
    join(fixtureRoot, 'node_modules'),
  ];

  directories.forEach((dir) => {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  });

  const srcRoot = join(process.cwd(), 'src');

  // Copy actual files from the repository (only if they don't exist in fixture)
  const filesToCopy: Array<{ source: string; destination: string }> = [
    // Config files
    { source: join(srcRoot, 'config', 'app-config.ts'), destination: join(fixtureRoot, 'src', 'config', 'app-config.ts') },
    { source: join(srcRoot, 'config', 'prompts-config.ts'), destination: join(fixtureRoot, 'src', 'config', 'prompts-config.ts') },
    { source: join(srcRoot, 'config', 'index.ts'), destination: join(fixtureRoot, 'src', 'config', 'index.ts') },
    
    // Helper files
    { source: join(srcRoot, 'helpers', 'file-scanner.ts'), destination: join(fixtureRoot, 'src', 'helpers', 'file-scanner.ts') },
    { source: join(srcRoot, 'helpers', 'source-processor.ts'), destination: join(fixtureRoot, 'src', 'helpers', 'source-processor.ts') },
    { source: join(srcRoot, 'helpers', 'chunk-enrichment.ts'), destination: join(fixtureRoot, 'src', 'helpers', 'chunk-enrichment.ts') },
    { source: join(srcRoot, 'helpers', 'chunk-indexer.ts'), destination: join(fixtureRoot, 'src', 'helpers', 'chunk-indexer.ts') },
    { source: join(srcRoot, 'helpers', 'hybrid-retriever.ts'), destination: join(fixtureRoot, 'src', 'helpers', 'hybrid-retriever.ts') },
    { source: join(srcRoot, 'helpers', 'context-builder.ts'), destination: join(fixtureRoot, 'src', 'helpers', 'context-builder.ts') },
    { source: join(srcRoot, 'helpers', 'answer-generator.ts'), destination: join(fixtureRoot, 'src', 'helpers', 'answer-generator.ts') },
    { source: join(srcRoot, 'helpers', 'provider-factory.ts'), destination: join(fixtureRoot, 'src', 'helpers', 'provider-factory.ts') },
    
    // Service files
    { source: join(srcRoot, 'services', 'indexing.ts'), destination: join(fixtureRoot, 'src', 'services', 'indexing.ts') },
    { source: join(srcRoot, 'services', 'search.ts'), destination: join(fixtureRoot, 'src', 'services', 'search.ts') },
    { source: join(srcRoot, 'services', 'chat.ts'), destination: join(fixtureRoot, 'src', 'services', 'chat.ts') },
    
    // Type files
    { source: join(srcRoot, 'types', 'config', 'app-config.schema.ts'), destination: join(fixtureRoot, 'src', 'types', 'config', 'app-config.schema.ts') },
    
    // Utility files
    { source: join(srcRoot, 'utils', 'env-loader.ts'), destination: join(fixtureRoot, 'src', 'utils', 'env-loader.ts') },
    { source: join(srcRoot, 'utils', 'yaml-loader.ts'), destination: join(fixtureRoot, 'src', 'utils', 'yaml-loader.ts') },
    
    // Model files
    { source: join(srcRoot, 'models', 'repository.ts'), destination: join(fixtureRoot, 'src', 'models', 'repository.ts') },
  ];

  let createdCount = 0;
  filesToCopy.forEach(({ source, destination }) => {
    if (existsSync(source) && !existsSync(destination)) {
      copyFileSync(source, destination);
      createdCount++;
    }
  });

  // Create additional test files (only if they don't exist)
  const additionalFiles: Array<{ path: string; content: string }> = [
    {
      path: join(fixtureRoot, 'docs', 'README.md'),
      content: `# Semantic Code Backend

Express + TypeScript backend service for semantic code analysis and RAG implementation.
`,
    },
    {
      path: join(fixtureRoot, 'scripts', 'util.py'),
      content: `print('vendored python util')`,
    },
    {
      path: join(fixtureRoot, 'scripts', 'deploy.sh'),
      content: `#!/bin/bash
echo "Deployment script"`,
    },
    {
      path: join(fixtureRoot, 'notes.txt'),
      content: `this is not a scanned extension`,
    },
    {
      path: join(fixtureRoot, 'node_modules', 'vendored.ts'),
      content: `// vendored dependency file
export const vendoredValue = true;`,
    },
    {
      path: join(fixtureRoot, 'node_modules', 'package.json'),
      content: `{
  "name": "vendored-package",
  "version": "1.0.0"
}`,
    },
    {
      path: join(fixtureRoot, 'src', 'app.ts'),
      content: `import express from 'express';

const app = express();
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

export default app;`,
    },
    {
      path: join(fixtureRoot, 'src', 'server.ts'),
      content: `import app from './app.js';

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(\`Server running on port \${port}\`);
});`,
    },
  ];

  additionalFiles.forEach(({ path, content }) => {
    if (!existsSync(path)) {
      writeFileSync(path, content, 'utf8');
      createdCount++;
    }
  });

  if (createdCount > 0) {
    console.log(`Test code base fixture created/updated at: ${fixtureRoot} (${createdCount} files)`);
  } else {
    console.log(`Test code base fixture already exists at: ${fixtureRoot}`);
  }
}
