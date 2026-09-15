import { FileScanner, type ScannedFile } from '@/services/core/index.js';

export async function selectFiles(
  repositoryPath: string,
  excludePatterns: string[],
): Promise<ScannedFile[]> {
  const scanner = new FileScanner(repositoryPath, (filePath) =>
    excludePatterns.some((pattern) => filePath.split('/').includes(pattern)),
  );
  const result = await scanner.scanFiles();
  if (result.isErr()) throw result.error;
  return result.value.filter((file) =>
    /\.(c|cc|cpp|cs|cts|go|h|hpp|java|js|jsx|markdown|md|mdx|mjs|mts|php|py|rb|rs|ts|tsx)$/i.test(file.filePath),
  );
}
