export type ExtractionStage =
  | 'upload/blob'
  | 'gemini-auth'
  | 'gemini-model'
  | 'parse'
  | 'size'
  | 'timeout'
  | 'extract';

export class StageError extends Error {
  code: ExtractionStage;
  detail: string;

  constructor(code: ExtractionStage, message: string, detail?: string) {
    super(message);
    this.name = 'StageError';
    this.code = code;
    this.detail = detail || message;
  }
}

export function statusForStage(code: ExtractionStage): number {
  switch (code) {
    case 'size':
      return 413;
    case 'gemini-auth':
      return 401;
    case 'timeout':
      return 504;
    default:
      return 500;
  }
}

export function classifyUnknownError(
  error: unknown,
  fallback: ExtractionStage = 'extract'
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

export function errorPayload(error: unknown, fallback: ExtractionStage = 'extract') {
  const staged = classifyUnknownError(error, fallback);
  return {
    error: staged.message,
    code: staged.code,
    detail: staged.detail,
    status: statusForStage(staged.code),
  };
}
