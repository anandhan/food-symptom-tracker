export const DEFAULT_GEMINI_MODEL = 'gemini-3.8-flash';
export const DEFAULT_GEMINI_ANALYSIS_MODEL = 'gemini-3.8-flash';

function stripModelsPrefix(id: string) {
  return id.replace(/^models\//i, '').trim();
}

export function isRetiredGeminiModel(id: string): boolean {
  const name = stripModelsPrefix(id).toLowerCase();
  return /(^|[/.])gemini-2\.5($|[-.])/.test(name);
}

export function resolveGeminiModel(raw?: string | null): string {
  const value = (raw ?? '').trim();
  if (!value) return DEFAULT_GEMINI_MODEL;
  const name = stripModelsPrefix(value);
  if (isRetiredGeminiModel(name)) return DEFAULT_GEMINI_MODEL;
  return name;
}

export function resolveGeminiAnalysisModel(raw?: string | null): string {
  const value = (raw ?? '').trim();
  if (!value) return DEFAULT_GEMINI_ANALYSIS_MODEL;
  const name = stripModelsPrefix(value);
  if (isRetiredGeminiModel(name)) return DEFAULT_GEMINI_ANALYSIS_MODEL;
  return name;
}

export function isGeminiNotFound(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();
  return (
    lower.includes('not_found') ||
    lower.includes('not found') ||
    lower.includes('no longer available') ||
    /\b404\b/.test(lower)
  );
}

function compareModelIds(a: string, b: string): number {
  const nums = (id: string) => (id.match(/\d+/g) || []).map(Number);
  const an = nums(a);
  const bn = nums(b);
  const n = Math.max(an.length, bn.length);
  for (let i = 0; i < n; i++) {
    const delta = (an[i] ?? 0) - (bn[i] ?? 0);
    if (delta) return delta;
  }
  return a.localeCompare(b);
}

async function pickNewestFlashFallback(ai: {
  models: { list: () => Promise<AsyncIterable<{ name?: string }>> };
}): Promise<string> {
  try {
    const pager = await ai.models.list();
    const flash: string[] = [];
    for await (const model of pager) {
      const name = stripModelsPrefix(String(model.name || ''));
      if (!/gemini/i.test(name) || !/flash/i.test(name)) continue;
      if (isRetiredGeminiModel(name)) continue;
      flash.push(name);
    }
    if (flash.length === 0) return DEFAULT_GEMINI_MODEL;
    flash.sort((a, b) => compareModelIds(b, a));
    return flash[0];
  } catch {
    return DEFAULT_GEMINI_MODEL;
  }
}

export async function generateContentWithFallback(options: {
  apiKey: string;
  model: string;
  contents: unknown;
  config?: Record<string, unknown>;
}): Promise<{ text: string; model: string }> {
  const { GoogleGenAI } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey: options.apiKey });

  const run = async (model: string) => {
    const result = await ai.models.generateContent({
      model,
      contents: options.contents as never,
      config: options.config,
    });
    return { text: result.text ?? '', model };
  };

  try {
    return await run(options.model);
  } catch (error) {
    if (!isGeminiNotFound(error)) throw error;

    const fallback = await pickNewestFlashFallback(
      ai as unknown as { models: { list: () => Promise<AsyncIterable<{ name?: string }>> } }
    );
    if (fallback === options.model) throw error;
    return await run(fallback);
  }
}
