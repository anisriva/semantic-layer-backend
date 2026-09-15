/**
 * Pipeline helper: file-scanner
 *
 * Wraps CodeRAG core's `FileScanner` to scan a filesystem root into
 * `ScannedFile[]`, honoring `excludePatterns`. Mirrors
 * `tests/helpers/select-files.ts` for production use.
 *
 * This helper contains no hardcoded patterns: callers supply
 * `excludePatterns` explicitly. Services source these from `@/config`
 * (`getIngestionConfig(fullConfig).excludePatterns`, backed by
 * `ragPipeline.ingestion.excludePatterns` in `config/app.yaml`) so the
 * value stays configurable end to end instead of being hardcoded in helper
 * code. Each pattern is a regular expression tested against the full
 * scanned file path; a file is excluded if any pattern matches.
 */
import { FileScanner, type ScannedFile } from '@/helpers/core/index.js';

export interface ScanFilesOptions {
  /** Regular-expression patterns tested against each file's path; any match excludes the file. */
  excludePatterns: string[];
}

/**
 * Scans `rootPath` for files, excluding any whose path matches one of
 * `options.excludePatterns`.
 *
 * @throws {import('@/helpers/core/index.js').ScanError} if the scan fails.
 */
export async function scanFiles(
  rootPath: string,
  options: ScanFilesOptions,
): Promise<ScannedFile[]> {
  const excludeMatchers = options.excludePatterns.map((pattern) => new RegExp(pattern));
  const scanner = new FileScanner(rootPath, (filePath) =>
    excludeMatchers.some((pattern) => pattern.test(filePath)),
  );
  const result = await scanner.scanFiles();
  if (result.isErr()) throw result.error;
  return result.value;
}
