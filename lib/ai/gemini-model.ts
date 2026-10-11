export const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';

export function resolveGeminiModel(raw?: string | null): string {
  const value = (raw ?? '').trim();
  if (!value) return DEFAULT_GEMINI_MODEL;
  if (!/^gemini-[\w.-]+$/i.test(value)) return DEFAULT_GEMINI_MODEL;
  return value;
}
