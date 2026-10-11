export const SAVE_TIMEOUT_MS = 25_000;

export function formatSaveError(
  payload: { error?: string; code?: string; detail?: string; stage?: string },
  fallback = 'Failed to save entry'
): string {
  const stage = payload.code || payload.stage || 'save';
  const message = payload.error || fallback;
  const detail =
    payload.detail && payload.detail !== message ? ` — ${payload.detail}` : '';
  return `[${stage}] ${message}${detail}`;
}

export function clientSaveTimeoutError(): string {
  return formatSaveError({
    code: 'timeout',
    error: 'Save timed out after 25s during persist',
    detail:
      'The entry may already be saved. Tap Save again — meals for that date/slot will be replaced, not duplicated.',
  });
}

export function isAbortError(error: unknown): boolean {
  return (
    (error instanceof Error && error.name === 'AbortError') ||
    (typeof DOMException !== 'undefined' &&
      error instanceof DOMException &&
      error.name === 'AbortError')
  );
}

export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}
