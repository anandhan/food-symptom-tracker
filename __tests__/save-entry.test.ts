import {
  isNeonHostedUrl,
  isPooledDatabaseUrl,
  resolveRuntimeDatabaseUrl,
  toNeonPooledUrl,
} from '../lib/db-url';
import {
  SAVE_TIMEOUT_MS,
  clientSaveTimeoutError,
  formatSaveError,
} from '../lib/entries/save-client';
import { classifySaveError, saveErrorPayload } from '../lib/ai/extraction-errors';
import { persistDailyEntry } from '../lib/entries/save-entry';
import { prisma } from '../lib/db';
import { parseCalendarDate } from '../lib/dates';
import { getVisionProvider } from '../lib/ai/vision-provider';
import * as geminiModel from '../lib/ai/gemini-model';

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/food_tracker_build';
}

jest.setTimeout(30_000);

describe('Neon / Vercel pooled URL', () => {
  const unpooled = 'postgresql://user:pass@ep-cool-name-123456.us-east-2.aws.neon.tech/neondb?sslmode=require';
  const pooled = 'postgresql://user:pass@ep-cool-name-123456-pooler.us-east-2.aws.neon.tech/neondb?sslmode=require&pgbouncer=true';

  it('detects Neon hosts and pooler URLs', () => {
    expect(isNeonHostedUrl(unpooled)).toBe(true);
    expect(isPooledDatabaseUrl(unpooled)).toBe(false);
    expect(isPooledDatabaseUrl(pooled)).toBe(true);
    expect(isNeonHostedUrl('postgresql://postgres:postgres@127.0.0.1:5432/food_tracker_build')).toBe(false);
  });

  it('rewrites an unpooled Neon DATABASE_URL to the pooler', () => {
    const resolved = resolveRuntimeDatabaseUrl(unpooled);
    expect(resolved).toContain('ep-cool-name-123456-pooler.us-east-2.aws.neon.tech');
    expect(resolved).toContain('pgbouncer=true');
    expect(resolved).toContain('connection_limit=1');
  });

  it('leaves local Postgres URLs unchanged', () => {
    const local = 'postgresql://postgres:postgres@127.0.0.1:5432/food_tracker_build';
    expect(resolveRuntimeDatabaseUrl(local)).toBe(local);
    expect(toNeonPooledUrl(unpooled)).toContain('-pooler');
  });
});

describe('Save client timeout errors', () => {
  it('uses a 25s timeout and includes the persist stage', () => {
    expect(SAVE_TIMEOUT_MS).toBe(25_000);
    expect(clientSaveTimeoutError()).toContain('[timeout]');
    expect(clientSaveTimeoutError()).toContain('persist');
    expect(formatSaveError({ code: 'persist', error: 'Failed to save entry', detail: 'connection reset' })).toBe(
      '[persist] Failed to save entry — connection reset'
    );
  });
});

describe('Save stage errors', () => {
  it('does not remap Prisma failures to Gemini stages', () => {
    const staged = classifySaveError(new Error('Unique constraint failed on the fields: (`dailyEntryId`,`mealType`)'));
    expect(staged.code).toBe('persist');
    const payload = saveErrorPayload(new Error('connect ETIMEDOUT 1.2.3.4:5432'));
    expect(payload.code).toBe('timeout');
    expect(payload.status).toBe(504);
  });
});

describe('persistDailyEntry against Postgres', () => {
  const geminiSpy = jest.spyOn(geminiModel, 'generateContentWithFallback');

  afterAll(async () => {
    geminiSpy.mockRestore();
    await prisma.$disconnect();
  });

  it('persists the MyFitnessPal fixture in one transaction and is idempotent', async () => {
    process.env.VISION_PROVIDER = 'mock';
    geminiSpy.mockClear();

    const extracted = await getVisionProvider().extractFoods('tests/fixtures/myfitnesspal-example.png');
    const meals = {
      breakfast: extracted.breakfast,
      lunch: extracted.lunch,
      dinner: extracted.dinner,
      snacks: extracted.snacks,
      drinks: extracted.drinks,
    };

    const user = await prisma.user.upsert({
      where: { email: 'save-test@local.test' },
      update: {},
      create: {
        email: 'save-test@local.test',
        username: 'save-test',
        authProvider: 'credentials',
      },
    });

    const date = parseCalendarDate('2026-10-05');
    const payload = {
      userId: user.id,
      date,
      meals,
      symptomNotes: 'fixture save',
      overallRating: 'okay',
    };

    const first = await persistDailyEntry(payload);
    const second = await persistDailyEntry({ ...payload, dailyEntryId: first.dailyEntryId });

    expect(second.dailyEntryId).toBe(first.dailyEntryId);
    expect(geminiSpy).not.toHaveBeenCalled();

    const [mealCount, itemCount, entries] = await Promise.all([
      prisma.meal.count({ where: { dailyEntryId: first.dailyEntryId } }),
      prisma.foodItem.count({
        where: { meal: { dailyEntryId: first.dailyEntryId } },
      }),
      prisma.dailyEntry.count({
        where: { userId: user.id, date },
      }),
    ]);

    expect(entries).toBe(1);
    expect(mealCount).toBe(first.mealSlots.length);
    expect(itemCount).toBe(first.foodItemIds.length);
    expect(itemCount).toBe(second.foodItemIds.length);
    expect(itemCount).toBeGreaterThanOrEqual(8);
  });
});
