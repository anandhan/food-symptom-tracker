import {
  ALLOWED_INTERPRETATION_LABELS,
  buildInterpretationPrompt,
  parseInterpretationOutput,
  createAiInterpretation,
} from '../lib/analysis/gemini-interpretation';
import { hashObservedSnapshot, type ObservedAnalysisSnapshot } from '../lib/analysis/observed-snapshot';
import { generateContentWithFallback } from '@/lib/ai/gemini-model';

jest.mock('@/lib/db', () => ({
  prisma: {
    aiInterpretation: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'interp-1',
        createdAt: new Date('2026-10-11T00:00:00.000Z'),
        ...data,
      })),
    },
  },
}));

jest.mock('@/lib/ai/gemini-model', () => ({
  resolveGeminiAnalysisModel: () => 'gemini-3.8-flash',
  generateContentWithFallback: jest.fn(),
}));

const snapshot: ObservedAnalysisSnapshot = {
  promptVersion: 'v1',
  range: { start: '2026-10-01', end: '2026-10-07', daysTracked: 7, totalDaysInPeriod: 7 },
  ratings: { counts: { great: 2, good: 2, okay: 1, bad: 2, very_bad: 0 }, goodDays: 4, badDays: 2 },
  concepts: [
    {
      concept: 'milk',
      daysWithFood: 5,
      daysWithFoodAndSymptoms: 3,
      symptomRateWith: 0.6,
      symptomRateWithout: 0.2,
      relativeRisk: 3,
      confidence: 'low',
      label: 'Not enough data yet',
      evidence: 'milk appeared on 5 out of 7 days.',
      sampleSize: 5,
    },
  ],
  lagWindows: { sameDay: [], nextDay: [] },
  mealSlots: { breakfast: { total: 7, withSymptoms: 2, rate: 0.286 } },
  combinations: [{ concepts: ['coffee', 'milk'], daysTogether: 4, daysTogetherWithSymptoms: 2, symptomRateTogether: 0.5 }],
  trends: { firstHalfBadRate: 0.25, secondHalfBadRate: 0.33, firstHalfDays: 3, secondHalfDays: 4 },
};

describe('Gemini interpretation', () => {
  const generate = generateContentWithFallback as jest.MockedFunction<typeof generateContentWithFallback>;

  beforeEach(() => {
    generate.mockReset();
    delete process.env.GEMINI_API_KEY;
  });

  it('hashes snapshots stably and never includes images', () => {
    expect(hashObservedSnapshot(snapshot)).toBe(hashObservedSnapshot({ ...snapshot }));
    const serialized = JSON.stringify(snapshot);
    expect(serialized).not.toMatch(/image|base64|png|jpeg/i);
    expect(snapshot.concepts[0].concept).toBe('milk');
  });

  it('builds a prompt that forbids causation and restricts labels', () => {
    const prompt = buildInterpretationPrompt(snapshot);
    expect(prompt).toContain('Never claim causation');
    expect(prompt).toContain('Possible association');
    expect(prompt).toContain('Strong pattern');
    expect(prompt).toContain('Not enough data yet');
    expect(prompt).toContain('Appears well tolerated');
    expect(prompt).toContain('"concept":"milk"');
    expect(prompt).not.toMatch(/data:image|base64,/);
  });

  it('parses structured JSON and remaps unknown labels', () => {
    const parsed = parseInterpretationOutput(JSON.stringify({
      summary: 'Milk has a 3.0x relative risk on 5 days.',
      patterns: [
        { concept: 'milk', label: 'causes symptoms', citation: 'RR 3.0 on 5 days' },
        { concept: 'coffee', label: 'Possible association', citation: 'next-day RR 1.6' },
      ],
      lowSampleFlags: ['milk sampleSize 5'],
      watchNextWeek: ['Keep logging milk separately from coffee'],
    }));
    expect(parsed.patterns[0].label).toBe('Not enough data yet');
    expect(parsed.patterns[1].label).toBe('Possible association');
    expect(ALLOWED_INTERPRETATION_LABELS).toContain(parsed.patterns[1].label);
  });

  it('stores an error and does not throw when the API key is missing', async () => {
    const result = await createAiInterpretation({
      userId: 'user-1',
      kind: 'analysis',
      snapshot,
    });
    expect(result.error).toBe('GEMINI_API_KEY is not set');
    expect(result.output).toBeNull();
    expect(result.modelId).toBe('none');
    expect(generate).not.toHaveBeenCalled();
  });

  it('stores Gemini JSON when the mocked model succeeds', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    generate.mockResolvedValue({
      text: JSON.stringify({
        summary: 'Coffee + milk shows a possible association (RR 3.0, 5 days).',
        patterns: [{ concept: 'milk', label: 'Possible association', citation: 'RR 3.0; 3/5 days with symptoms' }],
        lowSampleFlags: ['milk confidence is low (5 days)'],
        watchNextWeek: ['Note whether days without milk are clearer'],
      }),
      model: 'gemini-3.8-flash',
    });

    const result = await createAiInterpretation({
      userId: 'user-1',
      kind: 'weekly_report',
      weeklyReportId: 'rep-1',
      snapshot,
    });

    expect(generate).toHaveBeenCalledTimes(1);
    expect(generate.mock.calls[0][0].model).toBe('gemini-3.8-flash');
    expect(result.modelId).toBe('gemini-3.8-flash');
    expect(result.promptVersion).toBe('v1');
    expect(result.error).toBeNull();
    expect(result.output?.patterns[0].concept).toBe('milk');
    expect(result.inputSnapshotHash).toBe(hashObservedSnapshot(snapshot));
  });

  it('keeps observed-data generation working when Gemini throws', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    generate.mockRejectedValue(new Error('429 RESOURCE_EXHAUSTED'));

    const result = await createAiInterpretation({
      userId: 'user-1',
      kind: 'analysis',
      snapshot,
    });

    expect(result.output).toBeNull();
    expect(result.error).toContain('429');
  });
});
