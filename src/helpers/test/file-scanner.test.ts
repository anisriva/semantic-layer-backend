import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { getFullAppConfig, getIngestionConfig } from '@/config/index.js';
import { scanFiles } from '@/helpers/file-scanner.js';
import { setupTestCodeBase } from '../../../tests/utils/setup-test-code-base.js';

const fixtureRoot = join(process.cwd(), '.helpers', 'test-code-base');

describe('file-scanner helper', () => {
  const { excludePatterns } = getIngestionConfig(getFullAppConfig());
  let rootPath: string;

  beforeAll(() => {
    setupTestCodeBase();
  }, 10_000);

  beforeEach(async () => {
    rootPath = await mkdtemp(join(tmpdir(), 'file-scanner-'));
  });

  afterEach(async () => {
    await rm(rootPath, { force: true, recursive: true });
  });

  it('scans a root path and returns every file not matched by excludePatterns', async () => {
    const sourceDirectory = join(rootPath, 'src');
    await mkdir(sourceDirectory);
    await writeFile(join(sourceDirectory, 'index.ts'), 'export const value = 1;\n');
    await writeFile(join(rootPath, 'README.md'), '# Docs\n');
    await writeFile(join(rootPath, 'notes.txt'), 'plain text notes\n');

    const files = await scanFiles(rootPath, { excludePatterns: [] });

    const filePaths = files.map((file) => file.filePath).sort();
    expect(filePaths).toEqual(['README.md', 'notes.txt', 'src/index.ts']);
  });

  it('excludes files under directories listed in excludePatterns', async () => {
    const nodeModules = join(rootPath, 'node_modules');
    await mkdir(nodeModules);
    await writeFile(join(nodeModules, 'vendored.ts'), 'export const vendored = true;\n');
    await writeFile(join(rootPath, 'index.ts'), 'export const value = 1;\n');

    const files = await scanFiles(rootPath, { excludePatterns: ['node_modules'] });

    expect(files.map((file) => file.filePath)).toEqual(['index.ts']);
  });

  it('treats each excludePattern as a regular expression tested against the full file path', async () => {
    await writeFile(join(rootPath, 'notes.txt'), 'plain text notes\n');
    await writeFile(join(rootPath, 'index.ts'), 'export const value = 1;\n');

    const files = await scanFiles(rootPath, { excludePatterns: ['\\.txt$'] });

    expect(files.map((file) => file.filePath)).toEqual(['index.ts']);
  });

  it('excludes files matching a suffix-anchored regex pattern (as authored in config/app.yaml)', async () => {
    await writeFile(join(rootPath, 'app.min.js'), 'console.log(1);\n');
    await writeFile(join(rootPath, 'index.ts'), 'export const value = 1;\n');

    const files = await scanFiles(rootPath, { excludePatterns: ['\\.min\\.js$'] });

    expect(files.map((file) => file.filePath)).toEqual(['index.ts']);
  });

  it('applies the configured default excludePatterns from config/app.yaml', async () => {
    const gitDirectory = join(rootPath, '.git');
    await mkdir(gitDirectory);
    await writeFile(join(gitDirectory, 'HEAD'), 'ref: refs/heads/main\n');
    await writeFile(join(rootPath, 'index.ts'), 'export const value = 1;\n');

    const files = await scanFiles(rootPath, { excludePatterns });

    expect(files.map((file) => file.filePath)).toEqual(['index.ts']);
  });

  it('anchors the configured default excludePatterns to a path segment so they do not over-match unrelated filenames', async () => {
    // "target" is a configured excludePattern (Java/Kotlin/Scala build directory); a
    // naive unanchored regex would also match "search-target.ts" as a substring.
    await writeFile(join(rootPath, 'search-target.ts'), 'export function locateTarget(): void {}\n');

    const files = await scanFiles(rootPath, { excludePatterns });

    expect(files.map((file) => file.filePath)).toEqual(['search-target.ts']);
  });

  describe('against the .helpers/test-code-base fixture', () => {
    it('applies configured excludePatterns across a realistic multi-language tree', async () => {
      const files = await scanFiles(fixtureRoot, { excludePatterns });
      const filePaths = files.map((file) => file.filePath).sort();

      // Picked up: everything outside excluded directories, regardless of extension.
      expect(filePaths).toContain('src/config/app-config.ts');
      expect(filePaths).toContain('src/helpers/file-scanner.ts');
      expect(filePaths).toContain('docs/README.md');
      expect(filePaths).toContain('scripts/util.py');
      expect(filePaths).toContain('notes.txt');

      // Excluded: configured excludePatterns (node_modules).
      expect(filePaths).not.toContain('node_modules/vendored.ts');
    });

    it('excludes files matching an additional regex-style excludePattern', async () => {
      const files = await scanFiles(fixtureRoot, { excludePatterns: [...excludePatterns, '\\.py$'] });
      const filePaths = files.map((file) => file.filePath);

      expect(filePaths.some((path) => path.endsWith('.py'))).toBe(false);
      expect(filePaths).toContain('src/config/app-config.ts');
    });
  });
});
