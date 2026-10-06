// Wipe script to clean all sample data

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🗑️  Wiping database...');

  // Delete in correct order due to foreign keys
  await prisma.symptomEvent.deleteMany();
  await prisma.symptomRecord.deleteMany();
  await prisma.foodItemConcept.deleteMany();
  await prisma.foodItem.deleteMany();
  await prisma.meal.deleteMany();
  await prisma.ocrExtraction.deleteMany();
  await prisma.uploadedImage.deleteMany();
  await prisma.dailyEntry.deleteMany();
  await prisma.foodConcept.deleteMany();
  await prisma.weeklyReport.deleteMany();
  await prisma.analysisSnapshot.deleteMany();
  await prisma.user.deleteMany();

  console.log('✅ All data wiped!');
}

main()
  .catch((e) => {
    console.error('❌ Wipe failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
