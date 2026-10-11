import { prisma } from '@/lib/db';
import { StageError } from '@/lib/ai/extraction-errors';
import { isDrink } from '@/lib/ai/food-normalization';

export type SaveFoodItem = {
  text?: string | null;
  brand?: string | null;
  food_name?: string | null;
  quantity?: string | null;
  is_drink?: boolean | null;
  calories?: number | null;
  carbs?: number | null;
  fat?: number | null;
  protein?: number | null;
  fiber?: number | null;
  sugar?: number | null;
};

export type SaveMealsInput = Record<string, SaveFoodItem[] | undefined>;

export type PersistDailyEntryInput = {
  userId: string;
  dailyEntryId?: string | null;
  date: Date;
  meals: SaveMealsInput;
  symptomNotes?: string | null;
  overallRating?: string | null;
  bloating?: string | null;
  gas?: string | null;
  crampsPain?: string | null;
  diarrhea?: boolean | null;
  constipation?: boolean | null;
};

export type PersistDailyEntryResult = {
  dailyEntryId: string;
  foodItemIds: string[];
  mealSlots: string[];
};

function normalizeMealType(raw: string): string {
  return raw.trim().toLowerCase();
}

function isPrismaUniqueError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'P2002'
  );
}

function mealSlotsFromPayload(meals: SaveMealsInput): Array<{
  mealType: string;
  items: SaveFoodItem[];
}> {
  const slots = new Map<string, SaveFoodItem[]>();
  for (const [rawType, items] of Object.entries(meals || {})) {
    if (!Array.isArray(items)) continue;
    slots.set(normalizeMealType(rawType), items);
  }
  return [...slots.entries()].map(([mealType, items]) => ({ mealType, items }));
}

async function persistOnce(input: PersistDailyEntryInput): Promise<PersistDailyEntryResult> {
  const slots = mealSlotsFromPayload(input.meals);
  const slotTypes = slots.map((slot) => slot.mealType);

  return prisma.$transaction(async (tx) => {
    console.time('save:upsert-entry');
    let dailyEntry;
    if (input.dailyEntryId) {
      dailyEntry = await tx.dailyEntry.findUnique({
        where: { id: input.dailyEntryId },
      });
      if (!dailyEntry || dailyEntry.userId !== input.userId) {
        throw new StageError('auth', 'Invalid daily entry', 'Entry not found for this user');
      }
    } else {
      dailyEntry = await tx.dailyEntry.upsert({
        where: {
          userId_date: {
            userId: input.userId,
            date: input.date,
          },
        },
        update: {},
        create: {
          userId: input.userId,
          date: input.date,
        },
      });
    }
    console.timeEnd('save:upsert-entry');

    console.time('save:replace-meals');
    if (slotTypes.length > 0) {
      await tx.meal.deleteMany({
        where: {
          dailyEntryId: dailyEntry.id,
          mealType: { in: slotTypes },
        },
      });
    }

    const toCreate = slots.filter((slot) => slot.items.some((item) => String(item.text || '').trim()));
    const createdMeals =
      toCreate.length > 0
        ? await tx.meal.createManyAndReturn({
            data: toCreate.map((slot) => ({
              dailyEntryId: dailyEntry.id,
              mealType: slot.mealType,
            })),
          })
        : [];

    const mealIdByType = new Map(createdMeals.map((meal) => [meal.mealType, meal.id]));
    const foodRows = [];
    for (const slot of toCreate) {
      const mealId = mealIdByType.get(slot.mealType);
      if (!mealId) continue;
      let orderIndex = 0;
      for (const item of slot.items) {
        const rawText = String(item.text || '').trim();
        if (!rawText) continue;
        foodRows.push({
          mealId,
          rawText,
          brand: item.brand || null,
          foodName: item.food_name || null,
          quantity: item.quantity || null,
          isDrink: item.is_drink ?? isDrink(rawText),
          calories: item.calories ?? null,
          carbs: item.carbs ?? null,
          fat: item.fat ?? null,
          protein: item.protein ?? null,
          fiber: item.fiber ?? null,
          sugar: item.sugar ?? null,
          orderIndex: orderIndex++,
        });
      }
    }

    const createdFoods =
      foodRows.length > 0
        ? await tx.foodItem.createManyAndReturn({
            data: foodRows,
            select: { id: true },
          })
        : [];
    console.timeEnd('save:replace-meals');

    console.time('save:symptoms');
    if (input.symptomNotes) {
      await tx.symptomRecord.upsert({
        where: { dailyEntryId: dailyEntry.id },
        update: {
          freeTextNotes: input.symptomNotes,
          overallRating: input.overallRating || null,
          bloating: input.bloating || null,
          gas: input.gas || null,
          crampsPain: input.crampsPain || null,
          diarrhea: input.diarrhea || false,
          constipation: input.constipation || false,
        },
        create: {
          dailyEntryId: dailyEntry.id,
          freeTextNotes: input.symptomNotes,
          overallRating: input.overallRating || null,
          bloating: input.bloating || null,
          gas: input.gas || null,
          crampsPain: input.crampsPain || null,
          diarrhea: input.diarrhea || false,
          constipation: input.constipation || false,
        },
      });
    }
    console.timeEnd('save:symptoms');

    return {
      dailyEntryId: dailyEntry.id,
      foodItemIds: createdFoods.map((row) => row.id),
      mealSlots: toCreate.map((slot) => slot.mealType),
    };
  });
}

/** Persist the raw daily entry in one transaction. No Gemini, Blob, or analysis. */
export async function persistDailyEntry(
  input: PersistDailyEntryInput
): Promise<PersistDailyEntryResult> {
  console.time('save:persist');
  try {
    try {
      return await persistOnce(input);
    } catch (error) {
      if (isPrismaUniqueError(error)) {
        return await persistOnce(input);
      }
      throw error;
    }
  } finally {
    console.timeEnd('save:persist');
  }
}
