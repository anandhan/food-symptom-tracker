/**
 * Baseline timing for the current (pre-fix) save path:
 * sequential Meal.create + FoodItem.create + linkFoodItemConcepts per item.
 */
import { PrismaClient } from '@prisma/client';
import { parseCalendarDate } from '../lib/dates';
import { isDrink, linkFoodItemConcepts } from '../lib/ai/food-normalization';
import { getVisionProvider } from '../lib/ai/vision-provider';

const DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:5432/food_tracker_build';
process.env.DATABASE_URL = DATABASE_URL;

const prisma = new PrismaClient({ datasources: { db: { url: DATABASE_URL } } });

async function main() {
  process.env.VISION_PROVIDER = process.env.VISION_PROVIDER || 'mock';
  const provider = getVisionProvider();
  const extracted = await provider.extractFoods(
    'tests/fixtures/myfitnesspal-example.png'
  );
  const meals: Record<string, typeof extracted.breakfast> = {
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
  console.time('before:save:total');

  console.time('before:save:upsert-entry');
  const dailyEntry = await prisma.dailyEntry.upsert({
    where: { userId_date: { userId: user.id, date } },
    update: {},
    create: { userId: user.id, date },
  });
  console.timeEnd('before:save:upsert-entry');

  console.time('before:save:delete-meals');
  await prisma.meal.deleteMany({ where: { dailyEntryId: dailyEntry.id } });
  console.timeEnd('before:save:delete-meals');

  console.time('before:save:create-meals-and-link');
  let itemCount = 0;
  for (const [mealType, foodItems] of Object.entries(meals)) {
    if (!Array.isArray(foodItems) || foodItems.length === 0) continue;
    const meal = await prisma.meal.create({
      data: { dailyEntryId: dailyEntry.id, mealType },
    });
    for (let i = 0; i < foodItems.length; i++) {
      const item = foodItems[i];
      const foodItem = await prisma.foodItem.create({
        data: {
          mealId: meal.id,
          rawText: item.text,
          brand: item.brand || null,
          foodName: item.food_name || null,
          quantity: item.quantity || null,
          isDrink: item.is_drink ?? isDrink(item.text),
          calories: item.calories || null,
          carbs: item.carbs || null,
          fat: item.fat || null,
          protein: item.protein || null,
          fiber: item.fiber || null,
          sugar: item.sugar || null,
          orderIndex: i,
        },
      });
      itemCount += 1;
      await linkFoodItemConcepts(foodItem.id, item.text, item.brand);
    }
  }
  console.timeEnd('before:save:create-meals-and-link');

  console.time('before:save:symptoms');
  await prisma.symptomRecord.upsert({
    where: { dailyEntryId: dailyEntry.id },
    update: { freeTextNotes: 'timing baseline' },
    create: { dailyEntryId: dailyEntry.id, freeTextNotes: 'timing baseline' },
  });
  console.timeEnd('before:save:symptoms');

  console.timeEnd('before:save:total');
  const ms = Date.now() - started;
  const mealCount = await prisma.meal.count({ where: { dailyEntryId: dailyEntry.id } });
  console.log(
    JSON.stringify(
      {
        path: 'before',
        ms,
        itemCount,
        mealCount,
        geminiOnSave: Boolean(process.env.GEMINI_API_KEY) && process.env.VISION_PROVIDER !== 'mock',
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
