/**
 * Helper: source-resolver
 *
 * Resolves a `Repository` row to a local filesystem path the indexing
 * pipeline can scan, plus a commit marker to record on the completing job.
 *
 * MVP (current): only `LOCAL` sources are supported. The caller supplies an
 * already-available local directory (`Repository.local_path`) at repository
 * creation time; this helper only validates it still exists on disk.
 *
 * Deferred (Git Integration phase, see `artifacts/new/2-phased-development-plan.md`):
 * `GIT` sources will clone/pull the repository via CodeRAG's `SimpleGitClient`
 * (through `@/helpers/core/git/index.js`) and resolve the real commit head.
 * The worker and `RepositoryService` depend only on this helper's
 * `resolveSource` contract, so adding `GIT` support later does not require
 * changing call sites — only this file's `GIT` branch.
 */
import { access } from 'node:fs/promises';
import type { Repository } from '@prisma/client';

export interface ResolvedSource {
  /** Absolute local filesystem path the indexing pipeline should scan. */
  path: string;
}

/** Thrown when a repository's source cannot be resolved to a local path. */
export class SourceResolutionError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'SourceResolutionError';
  }
}

/** Thrown for `GIT` sources until the Git Integration phase implements cloning. */
export class UnsupportedSourceTypeError extends Error {
  constructor(sourceType: string) {
    super(
      `Source type "${sourceType}" is not yet supported. Git integration is planned ` +
        `register repositories with sourceType "LOCAL" and an accessible local_path.`,
    );
    this.name = 'UnsupportedSourceTypeError';
  }
}

/**
 * Resolves `repository` to a local path ready for `IndexingService.indexPath`.
 *
 * @throws {SourceResolutionError} if a `LOCAL` repository's `local_path` is
 * missing or no longer exists on disk.
 * @throws {UnsupportedSourceTypeError} for `GIT` repositories (not yet implemented).
 */
export async function resolveSource(repository: Repository): Promise<ResolvedSource> {
  if (repository.source_type === 'LOCAL') {
    if (!repository.local_path) {
      throw new SourceResolutionError(
        `Repository ${repository.id} has source_type LOCAL but no local_path set`,
      );
    }

    try {
      await access(repository.local_path);
    } catch (error) {
      throw new SourceResolutionError(
        `local_path "${repository.local_path}" for repository ${repository.id} is not accessible`,
        error,
      );
    }

    return { path: repository.local_path };
  }

  throw new UnsupportedSourceTypeError(repository.source_type);
}

/**
 * Generates the commit marker to record on a job created for `repository`.
 *
 * For `LOCAL` sources there is no real git history, so this returns a
 * synthetic, monotonically-useful marker (not a git SHA). Once the Git
 * Integration phase lands, `GIT` sources will resolve a real commit SHA here
 * instead (e.g. via CodeRAG's `SimpleGitClient`), keeping this the single
 * call site `RepositoryService` uses when creating `INDEX`/`REFRESH` jobs.
 */
export function generateCommitMarker(repository: Pick<Repository, 'source_type'>): string {
  if (repository.source_type === 'LOCAL') {
    return `local-${Date.now()}`;
  }

  throw new UnsupportedSourceTypeError(repository.source_type);
}
