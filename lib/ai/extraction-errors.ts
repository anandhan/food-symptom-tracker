export type ExtractionStage =
  | 'upload/blob'
  | 'gemini-auth'
  | 'gemini-model'
  | 'parse'
  | 'size'
  | 'timeout'
  | 'extract';

export type StageCode = ExtractionStage | 'auth' | 'validate' | 'persist' | 'save';

export class StageError extends Error {
  code: StageCode;
  detail: string;

  constructor(code: StageCode, message: string, detail?: string) {
    super(message);
    this.name = 'StageError';
    this.code = code;
    this.detail = detail || message;
  }
}

export function statusForStage(code: StageCode): number {
  switch (code) {
    case 'size':
      return 413;
    case 'auth':
    case 'gemini-auth':
      return 401;
    case 'validate':
      return 400;
    case 'timeout':
      return 504;
    default:
      return 500;
  }
}

export function classifyUnknownError(
  error: unknown,
  fallback: StageCode = 'extract'
): StageError {
  if (error instanceof StageError) return error;

  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();

  if (
    lower.includes('api key') ||
    lower.includes('api_key') ||
    lower.includes('unauthenticated') ||
    lower.includes('permission_denied') ||
    lower.includes('401') ||
    lower.includes('403')
  ) {
    return new StageError('gemini-auth', 'Gemini rejected the API key', message);
  }

  if (
    lower.includes('not found') ||
    lower.includes('not_found') ||
    lower.includes('404') ||
    lower.includes('invalid model') ||
    lower.includes('unknown model') ||
    lower.includes('no longer available')
  ) {
    return new StageError('gemini-model', 'Gemini model is invalid or unavailable', message);
  }

  if (
    lower.includes('timeout') ||
    lower.includes('timed out') ||
    lower.includes('deadline') ||
    lower.includes('etimedout')
  ) {
    return new StageError('timeout', 'Extraction timed out', message);
  }

  if (
    lower.includes('too large') ||
    lower.includes('payload') ||
    lower.includes('413') ||
    lower.includes('request entity')
  ) {
    return new StageError('size', 'Image or request is too large', message);
  }

  if (
    lower.includes('json') ||
    lower.includes('unexpected token') ||
    lower.includes('parse')
  ) {
    return new StageError('parse', 'Could not parse the model response', message);
  }

  return new StageError(fallback, message || 'Extraction failed', message);
}

export function errorPayload(error: unknown, fallback: StageCode = 'extract') {
  const staged = classifyUnknownError(error, fallback);
  return {
    error: staged.message,
    code: staged.code,
    detail: staged.detail,
    status: statusForStage(staged.code),
  };
}

/** Classify save-path failures without remapping Prisma errors to Gemini stages. */
export function classifySaveError(error: unknown): StageError {
  if (error instanceof StageError) return error;

  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();

  if (lower.includes('unauthorized') || lower.includes('not signed in')) {
    return new StageError('auth', 'Unauthorized', message);
  }
  if (lower.includes('invalid calendar date') || lower.includes('required')) {
    return new StageError('validate', message || 'Invalid save payload', message);
  }
  if (
    lower.includes('timeout') ||
    lower.includes('timed out') ||
    lower.includes('deadline') ||
    lower.includes('etimedout')
  ) {
    return new StageError('timeout', 'Save timed out during persist', message);
  }

  return new StageError('persist', 'Failed to save entry', message);
}

export function saveErrorPayload(error: unknown) {
  const staged = classifySaveError(error);
  return {
    error: staged.message,
    code: staged.code,
    detail: staged.detail,
    status: statusForStage(staged.code),
  };
}
