// Backfill FoodConcept + FoodItemConcept for existing food items

import { backfillAllFoodItemConcepts } from '../lib/ai/food-normalization';
import { prisma } from '../lib/db';

async function main() {
  console.log('Backfilling food concepts…');
  const { items, links } = await backfillAllFoodItemConcepts();
  const conceptCount = await prisma.foodConcept.count();
  console.log(`✓ ${items} food items, ${links} concept links, ${conceptCount} concepts`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
