/**
 * Timing for the persist-first save path (no Gemini on the request).
 */
import { persistDailyEntry } from '../lib/entries/save-entry';
import { prisma } from '../lib/db';
import { parseCalendarDate } from '../lib/dates';
import { getVisionProvider } from '../lib/ai/vision-provider';

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'postgresql://postgres:postgres@127.0.0.1:5432/food_tracker_build';
}

async function main() {
  process.env.VISION_PROVIDER = process.env.VISION_PROVIDER || 'mock';
  const extracted = await getVisionProvider().extractFoods(
    'tests/fixtures/myfitnesspal-example.png'
  );
  const meals = {
    breakfast: extracted.breakfast,
    lunch: extracted.lunch,
    dinner: extracted.dinner,
    snacks: extracted.snacks,
    drinks: extracted.drinks,
  };

  const user = await prisma.user.upsert({
    where: { email: 'save-timing@local.test' },
    update: {},
    create: {
      email: 'save-timing@local.test',
      username: 'save-timing',
      authProvider: 'credentials',
    },
  });

  const date = parseCalendarDate('2026-10-05');
  const started = Date.now();
  console.time('after:save:total');
  const result = await persistDailyEntry({
    userId: user.id,
    date,
    meals,
    symptomNotes: 'timing after',
    overallRating: 'okay',
  });
  console.timeEnd('after:save:total');

  const retryStarted = Date.now();
  console.time('after:save:retry');
  const retry = await persistDailyEntry({
    userId: user.id,
    dailyEntryId: result.dailyEntryId,
    date,
    meals,
    symptomNotes: 'timing after retry',
  });
  console.timeEnd('after:save:retry');

  const mealCount = await prisma.meal.count({ where: { dailyEntryId: result.dailyEntryId } });
  const itemCount = await prisma.foodItem.count({
    where: { meal: { dailyEntryId: result.dailyEntryId } },
  });

  console.log(
    JSON.stringify(
      {
        path: 'after',
        persistMs: Date.now() - started,
        retryMs: Date.now() - retryStarted,
        dailyEntryId: result.dailyEntryId,
        retryDailyEntryId: retry.dailyEntryId,
        mealCount,
        itemCount,
        mealSlots: result.mealSlots,
      },
      null,
      2
    )
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
