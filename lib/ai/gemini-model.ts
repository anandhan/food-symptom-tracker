export const DEFAULT_GEMINI_MODEL = 'gemini-3.8-flash';
export const DEFAULT_GEMINI_ANALYSIS_MODEL = 'gemini-3.8-flash';

export const GEMINI_PRIMARY_ATTEMPTS = 3;
export const GEMINI_BACKOFF_MS = [1000, 2000, 4000] as const;
export const GEMINI_RETRY_DEADLINE_MS = 50_000;

const STATIC_ALTERNATES = [
  DEFAULT_GEMINI_MODEL,
  'gemini-3.8-flash-lite',
  'gemini-3.8-pro',
  'gemini-flash-latest',
  'gemini-pro-latest',
];

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

export function isGeminiTransient(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();
  return (
    /\b503\b/.test(lower) ||
    /\b429\b/.test(lower) ||
    lower.includes('unavailable') ||
    lower.includes('resource_exhausted') ||
    lower.includes('resource exhausted') ||
    lower.includes('high demand') ||
    lower.includes('overloaded') ||
    lower.includes('too many requests') ||
    lower.includes('try again later') ||
    (/\b500\b/.test(lower) && (lower.includes('internal') || lower.includes('server error'))) ||
    lower.includes('econnreset') ||
    lower.includes('enotfound') ||
    lower.includes('etimedout') ||
    lower.includes('eai_again') ||
    lower.includes('network') ||
    lower.includes('fetch failed') ||
    lower.includes('socket hang up') ||
    lower.includes('deadline exceeded')
  );
}

export function backoffDelayMs(attemptIndex: number, random: () => number = Math.random): number {
  const base = GEMINI_BACKOFF_MS[Math.min(Math.max(attemptIndex, 0), GEMINI_BACKOFF_MS.length - 1)];
  return Math.round(base * (0.5 + random()));
}

export async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
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

type ListedModel = {
  name?: string;
  supportedGenerationMethods?: string[];
  supportedActions?: string[];
  inputModalities?: string[];
  supportedInputModalities?: string[];
};

function listedName(model: ListedModel): string {
  return stripModelsPrefix(String(model.name || ''));
}

function supportsGenerateContent(model: ListedModel): boolean {
  const methods = [
    ...(model.supportedGenerationMethods || []),
    ...(model.supportedActions || []),
  ].map((method) => String(method).toLowerCase());
  if (methods.length === 0) return true;
  return methods.some((method) => method.includes('generatecontent') || method === 'generate_content');
}

function looksLikeChatVariant(name: string): boolean {
  const lower = name.toLowerCase();
  if (!/gemini/i.test(lower)) return false;
  if (isRetiredGeminiModel(lower)) return false;
  if (/embedding|imagen|tts|audio|robotics|computer-use|native-audio|live|image-generation/.test(lower)) {
    return false;
  }
  return /flash-lite|flash|pro/.test(lower);
}

function supportsImageInput(model: ListedModel): boolean {
  const modalities = [
    ...(model.inputModalities || []),
    ...(model.supportedInputModalities || []),
  ].map((item) => String(item).toLowerCase());
  if (modalities.length === 0) return true;
  return modalities.some((item) => item.includes('image'));
}

async function listListedModels(ai: {
  models: { list: () => Promise<AsyncIterable<ListedModel> | ListedModel[]> };
}): Promise<ListedModel[]> {
  const pager = await ai.models.list();
  if (Array.isArray(pager)) return pager;
  const models: ListedModel[] = [];
  for await (const model of pager) models.push(model);
  return models;
}

async function pickNewestFlashFallback(ai: {
  models: { list: () => Promise<AsyncIterable<ListedModel> | ListedModel[]> };
}): Promise<string> {
  try {
    const flash = (await listListedModels(ai))
      .map(listedName)
      .filter((name) => /gemini/i.test(name) && /flash/i.test(name) && !isRetiredGeminiModel(name));
    if (flash.length === 0) return DEFAULT_GEMINI_MODEL;
    flash.sort((a, b) => compareModelIds(b, a));
    return flash[0];
  } catch {
    return DEFAULT_GEMINI_MODEL;
  }
}

async function listAlternateModels(
  ai: {
    models: { list: () => Promise<AsyncIterable<ListedModel> | ListedModel[]> };
  },
  primary: string,
  requireImageInput: boolean
): Promise<string[]> {
  const seen = new Set<string>([stripModelsPrefix(primary)]);
  const names: string[] = [];
  try {
    for (const model of await listListedModels(ai)) {
      const name = listedName(model);
      if (!name || seen.has(name)) continue;
      if (!looksLikeChatVariant(name) || !supportsGenerateContent(model)) continue;
      if (requireImageInput && !supportsImageInput(model)) continue;
      seen.add(name);
      names.push(name);
    }
  } catch (error) {
    console.warn('[gemini] models.list failed while picking alternates', error);
  }

  if (names.length === 0) {
    for (const candidate of STATIC_ALTERNATES) {
      if (!seen.has(candidate)) {
        seen.add(candidate);
        names.push(candidate);
      }
    }
  }

  names.sort((a, b) => {
    const rank = (id: string) => {
      if (/flash-lite/.test(id)) return 1;
      if (/flash/.test(id)) return 0;
      if (/pro/.test(id)) return 2;
      return 3;
    };
    const delta = rank(a) - rank(b);
    if (delta) return delta;
    return compareModelIds(b, a);
  });
  return names;
}

export async function generateContentWithFallback(options: {
  apiKey: string;
  model: string;
  contents: unknown;
  config?: Record<string, unknown>;
  deadlineMs?: number;
  requireImageInput?: boolean;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  random?: () => number;
}): Promise<{ text: string; model: string }> {
  const { GoogleGenAI } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey: options.apiKey });
  const sleepFn = options.sleep ?? sleep;
  const now = options.now ?? Date.now;
  const started = now();
  const deadline = started + (options.deadlineMs ?? GEMINI_RETRY_DEADLINE_MS);
  const remaining = () => deadline - now();

  const run = async (model: string) => {
    const result = await ai.models.generateContent({
      model,
      contents: options.contents as never,
      config: options.config,
    });
    return { text: result.text ?? '', model };
  };

  const tryModel = async (model: string, attempts: number) => {
    let lastError: unknown;
    for (let i = 0; i < attempts; i++) {
      if (remaining() < 1500 && lastError) throw lastError;
      try {
        const result = await run(model);
        console.log(`[gemini] succeeded model=${result.model}`);
        return result;
      } catch (error) {
        lastError = error;
        if (isGeminiNotFound(error) || !isGeminiTransient(error)) throw error;
        if (i >= attempts - 1) break;
        const wait = Math.min(
          backoffDelayMs(i, options.random),
          Math.max(0, remaining() - 1500)
        );
        if (wait <= 0) throw error;
        console.warn(
          `[gemini] transient error on ${model}, retry ${i + 2}/${attempts} in ${wait}ms`,
          error instanceof Error ? error.message : error
        );
        await sleepFn(wait);
      }
    }
    throw lastError;
  };

  try {
    return await tryModel(options.model, GEMINI_PRIMARY_ATTEMPTS);
  } catch (error) {
    if (isGeminiNotFound(error)) {
      const fallback = await pickNewestFlashFallback(ai);
      if (fallback === options.model) throw error;
      if (remaining() < 1500) throw error;
      const result = await run(fallback);
      console.log(`[gemini] succeeded model=${result.model} after 404 fallback`);
      return result;
    }
    if (!isGeminiTransient(error)) throw error;

    const alternates = await listAlternateModels(ai, options.model, Boolean(options.requireImageInput));
    let lastError = error;
    for (const alternate of alternates) {
      if (remaining() < 1500) break;
      try {
        const result = await run(alternate);
        console.log(`[gemini] succeeded model=${result.model} after alternate fallback`);
        return result;
      } catch (alternateError) {
        lastError = alternateError;
        console.warn(
          `[gemini] alternate ${alternate} failed`,
          alternateError instanceof Error ? alternateError.message : alternateError
        );
      }
    }
    throw lastError;
  }
}
