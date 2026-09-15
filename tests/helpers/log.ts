export function log(
  stage: string,
  message: string,
  metadata: Record<string, unknown> = {},
): void {
  console.log(JSON.stringify({
    level: 'info',
    message,
    stage,
    timestamp: new Date().toISOString(),
    ...metadata,
  }));
}
