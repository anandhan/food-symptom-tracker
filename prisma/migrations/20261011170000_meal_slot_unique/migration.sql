-- Keep one meal per date/slot so a timed-out retry cannot duplicate rows.
DELETE FROM "Meal" a
USING "Meal" b
WHERE a."dailyEntryId" = b."dailyEntryId"
  AND a."mealType" = b."mealType"
  AND a."id" < b."id";

DROP INDEX IF EXISTS "Meal_dailyEntryId_mealType_idx";

CREATE UNIQUE INDEX "Meal_dailyEntryId_mealType_key" ON "Meal"("dailyEntryId", "mealType");
