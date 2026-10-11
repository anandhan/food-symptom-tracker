import { prisma } from '@/lib/db';
import {
  generateContentWithFallback,
  resolveGeminiAnalysisModel,
} from '@/lib/ai/gemini-model';
import {
  INTERPRETATION_PROMPT_VERSION,
  hashObservedSnapshot,
  type ObservedAnalysisSnapshot,
} from './observed-snapshot';

export const ALLOWED_INTERPRETATION_LABELS = [
  'Possible association',
  'Strong pattern',
  'Not enough data yet',
  'Appears well tolerated',
] as const;

export type InterpretationLabel = (typeof ALLOWED_INTERPRETATION_LABELS)[number];

export type GeminiInterpretationOutput = {
  summary: string;
  patterns: Array<{ concept: string; label: InterpretationLabel; citation: string }>;
  lowSampleFlags: string[];
  watchNextWeek: string[];
};

export type StoredInterpretation = {
  id: string;
  kind: string;
  modelId: string;
  promptVersion: string;
  inputSnapshotHash: string;
  output: GeminiInterpretationOutput | null;
  error: string | null;
  createdAt: Date;
};

const ALLOWED = new Set<string>(ALLOWED_INTERPRETATION_LABELS);

export function buildInterpretationPrompt(snapshot: ObservedAnalysisSnapshot): string {
  return `You interpret already-computed food-symptom statistics. The numbers are the source of truth — do not invent, recalculate, or change them.

Rules:
- Never claim causation.
- Use only these labels: Possible association, Strong pattern, Not enough data yet, Appears well tolerated.
- Cite the specific numbers you relied on (days, rates, relative risk, sample size).
- Flag low sample sizes (confidence "low" or sampleSize < 10).
- Suggest what to watch next week.
- Use only the food concept names provided. There are no images.

Observed stats JSON:
${JSON.stringify(snapshot)}

Return JSON only with this shape:
{"summary":"string","patterns":[{"concept":"string","label":"Possible association","citation":"string"}],"lowSampleFlags":["string"],"watchNextWeek":["string"]}`;
}

export function parseInterpretationOutput(text: string): GeminiInterpretationOutput {
  const trimmed = text.trim();
  const jsonText =
    trimmed.startsWith('{')
      ? trimmed
      : trimmed.match(/\{[\s\S]*\}/)?.[0] || trimmed;
  const parsed = JSON.parse(jsonText);
  const patterns = Array.isArray(parsed.patterns)
    ? parsed.patterns
        .map((row: { concept?: string; label?: string; citation?: string }) => ({
          concept: String(row.concept || '').trim(),
          label: ALLOWED.has(String(row.label))
            ? (row.label as InterpretationLabel)
            : ('Not enough data yet' as InterpretationLabel),
          citation: String(row.citation || '').trim(),
        }))
        .filter((row: { concept: string }) => row.concept)
    : [];

  return {
    summary: String(parsed.summary || '').trim() || 'No interpretation was returned.',
    patterns,
    lowSampleFlags: Array.isArray(parsed.lowSampleFlags)
      ? parsed.lowSampleFlags.map((item: unknown) => String(item))
      : [],
    watchNextWeek: Array.isArray(parsed.watchNextWeek)
      ? parsed.watchNextWeek.map((item: unknown) => String(item))
      : [],
  };
}

async function persistInterpretation(data: {
  userId: string;
  kind: string;
  weeklyReportId?: string | null;
  snapshot: ObservedAnalysisSnapshot;
  modelId: string;
  output: GeminiInterpretationOutput | null;
  error: string | null;
}): Promise<StoredInterpretation> {
  const inputSnapshot = JSON.stringify(data.snapshot);
  const created = await prisma.aiInterpretation.create({
    data: {
      userId: data.userId,
      kind: data.kind,
      weeklyReportId: data.weeklyReportId || null,
      modelId: data.modelId,
      promptVersion: INTERPRETATION_PROMPT_VERSION,
      inputSnapshotHash: hashObservedSnapshot(data.snapshot),
      inputSnapshot,
      outputJson: data.output ? JSON.stringify(data.output) : null,
      error: data.error,
    },
  });
  return {
    id: created.id,
    kind: created.kind,
    modelId: created.modelId,
    promptVersion: created.promptVersion,
    inputSnapshotHash: created.inputSnapshotHash,
    output: data.output,
    error: created.error,
    createdAt: created.createdAt,
  };
}

export async function createAiInterpretation(options: {
  userId: string;
  kind: 'analysis' | 'weekly_report';
  weeklyReportId?: string | null;
  snapshot: ObservedAnalysisSnapshot;
}): Promise<StoredInterpretation> {
  const model = resolveGeminiAnalysisModel(process.env.GEMINI_ANALYSIS_MODEL);
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return persistInterpretation({
      ...options,
      modelId: 'none',
      output: null,
      error: 'GEMINI_API_KEY is not set',
    });
  }

  try {
    const { text, model: usedModel } = await generateContentWithFallback({
      apiKey,
      model,
      contents: buildInterpretationPrompt(options.snapshot),
      config: { responseMimeType: 'application/json' },
    });
    if (!text.trim()) {
      return persistInterpretation({
        ...options,
        modelId: usedModel,
        output: null,
        error: 'Gemini returned an empty interpretation',
      });
    }
    return persistInterpretation({
      ...options,
      modelId: usedModel,
      output: parseInterpretationOutput(text),
      error: null,
    });
  } catch (error) {
    return persistInterpretation({
      ...options,
      modelId: model,
      output: null,
      error: error instanceof Error ? error.message : 'Gemini interpretation failed',
    });
  }
}

export async function latestInterpretation(options: {
  userId: string;
  kind: 'analysis' | 'weekly_report';
  weeklyReportId?: string | null;
}): Promise<StoredInterpretation | null> {
  const row = await prisma.aiInterpretation.findFirst({
    where: {
      userId: options.userId,
      kind: options.kind,
      ...(options.weeklyReportId ? { weeklyReportId: options.weeklyReportId } : {}),
    },
    orderBy: { createdAt: 'desc' },
  });
  if (!row) return null;
  return {
    id: row.id,
    kind: row.kind,
    modelId: row.modelId,
    promptVersion: row.promptVersion,
    inputSnapshotHash: row.inputSnapshotHash,
    output: row.outputJson ? (JSON.parse(row.outputJson) as GeminiInterpretationOutput) : null,
    error: row.error,
    createdAt: row.createdAt,
  };
}

export function toPublicInterpretation(row: StoredInterpretation) {
  return {
    id: row.id,
    modelId: row.modelId,
    promptVersion: row.promptVersion,
    inputSnapshotHash: row.inputSnapshotHash,
    createdAt: row.createdAt,
    output: row.output,
    error: row.error,
  };
}
