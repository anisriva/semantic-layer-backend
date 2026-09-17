/**
 * Helper: job-log-capture
 *
 * Tees `console.log`/`console.warn`/`console.error` output produced while
 * processing a single job into `JobLog` rows, so `GET /api/v1/jobs/:id/logs`
 * (SSE) can stream live progress to a client without every pipeline stage
 * (`IndexingService`, pipeline helpers, `AuditLogDao`, ...) needing to know
 * about job-scoped persistence.
 *
 * Safe because a single worker process claims and processes jobs
 * sequentially (Section 12.1) — only one job's output is ever being
 * captured on a given worker's `console` at a time. Other worker processes
 * have their own `console`, so there is no cross-job interference.
 *
 * Console output is still written through to the real console (stdout),
 * so operator-facing logs are unchanged; this only adds a side channel.
 */
import type { JobLogDao, CreateJobLogData } from '@/daos/index.js';

type ConsoleMethod = 'log' | 'warn' | 'error';

const LEVEL_BY_METHOD: Record<ConsoleMethod, CreateJobLogData['level']> = {
  log: 'info',
  warn: 'warn',
  error: 'error',
};

function formatArgs(args: unknown[]): string {
  return args
    .map((arg) => {
      if (typeof arg === 'string') return arg;
      try {
        return JSON.stringify(arg);
      } catch {
        return String(arg);
      }
    })
    .join(' ');
}

/**
 * Runs `fn`, persisting every `console.log`/`warn`/`error` call made during
 * its execution (on this call stack's shared `console` object) as `JobLog`
 * rows for `jobId`. Buffers lines and flushes periodically/at the end to
 * avoid one INSERT per line.
 */
export async function withJobLogCapture<T>(
  jobId: string,
  jobLogDao: JobLogDao,
  fn: () => Promise<T>,
  flushIntervalMs = 250,
): Promise<T> {
  const original: Record<ConsoleMethod, (...args: unknown[]) => void> = {
    log: console.log.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
  };

  let buffer: CreateJobLogData[] = [];

  const flush = async (): Promise<void> => {
    if (buffer.length === 0) return;
    const toFlush = buffer;
    buffer = [];
    try {
      await jobLogDao.createMany(toFlush);
    } catch (error) {
      original.error('[JobLogCapture] Failed to persist job logs:', error);
    }
  };

  const flushTimer = setInterval(() => {
    void flush();
  }, flushIntervalMs);

  (['log', 'warn', 'error'] as ConsoleMethod[]).forEach((method) => {
    console[method] = (...args: unknown[]) => {
      buffer.push({ jobId, message: formatArgs(args), level: LEVEL_BY_METHOD[method] });
      original[method](...args);
    };
  });

  try {
    return await fn();
  } finally {
    console.log = original.log;
    console.warn = original.warn;
    console.error = original.error;
    clearInterval(flushTimer);
    await flush();
  }
}
