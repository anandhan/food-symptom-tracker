// Seed script with 3-4 weeks of realistic sample data

import { PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';
import { linkFoodItemConcepts, isDrink } from '../lib/ai/food-normalization';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Create test user
  const hashedPassword = await hash('password123', 12);
  const user = await prisma.user.upsert({
    where: { username: 'testuser' },
    update: {},
    create: {
      username: 'testuser',
      email: 'test@example.com',
      name: 'Test User',
      passwordHash: hashedPassword,
      authProvider: 'credentials',
    },
  });

  console.log('✓ Created test user (username: testuser, password: password123)');

  // Sample foods
  const sampleMeals = [
    {
      breakfast: ['Coffee with milk', 'Toast with butter', 'Scrambled eggs'],
      lunch: ['Chicken salad', 'Rice', 'Water'],
      dinner: ['Pasta', 'Tomato sauce', 'Garlic bread'],
      snacks: ['Apple', 'Peanuts'],
      drinks: ['Tea'],
    },
    {
      breakfast: ['Oatmeal', 'Banana', 'Coffee'],
      lunch: ['Turkey sandwich', 'Chips', 'Soda'],
      dinner: ['Grilled chicken', 'Vegetables', 'Quinoa'],
      snacks: ['Yogurt', 'Granola bar'],
      drinks: ['Orange juice'],
    },
    {
      breakfast: ['Dunkin\' Donuts - Latte With Sugar', 'Bagel with cream cheese'],
      lunch: ['Wellwish Dumplings - Chicken Dumplings', 'Metamucil Sugar Free'],
      dinner: ['Idly', 'Potato wedge'],
      snacks: ['Nature Valley - Crunchy Oats & Honey Granola', 'Starbucks - Espresso & Cream'],
      drinks: ['Coconut water'],
    },
    {
      breakfast: ['Cereal with milk', 'Orange'],
      lunch: ['Tomato soup', 'Crackers'],
      dinner: ['Pizza', 'Salad'],
      snacks: ['Cheese', 'Grapes'],
      drinks: ['Lemonade', 'Water'],
    },
  ];

  const symptomDescriptions = [
    { rating: 'great', text: 'Felt amazing all day! No issues whatsoever.' },
    { rating: 'good', text: 'Pretty good day. Slight bloating after lunch but went away quickly.' },
    { rating: 'okay', text: 'Moderate bloating in the evening. Some gas after dinner.' },
    { rating: 'bad', text: 'Bloating after lunch. Cramps around 7 PM. Not a good day.' },
    { rating: 'very_bad', text: 'Severe cramping all afternoon. Diarrhea after dinner. Terrible day.' },
  ];

  // Generate 4 weeks of calendar dates stored as UTC midnight
  const today = new Date();
  const todayUtc = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));

  for (let i = 0; i < 28; i++) {
    const date = new Date(todayUtc);
    date.setUTCDate(date.getUTCDate() - (27 - i));

    // Use meal pattern based on day
    const mealPattern = sampleMeals[i % sampleMeals.length];
    
    // Vary symptoms - more bad days with certain foods
    let symptomIndex;
    if (i % sampleMeals.length === 2) {
      // Day with milk/dairy - higher chance of issues
      symptomIndex = Math.random() < 0.7 ? (Math.random() < 0.5 ? 3 : 4) : 2;
    } else if (i % sampleMeals.length === 3) {
      // Day with pizza/tomato - medium chance of issues
      symptomIndex = Math.random() < 0.5 ? (Math.random() < 0.5 ? 2 : 3) : 1;
    } else {
      // Good days
      symptomIndex = Math.random() < 0.8 ? (Math.random() < 0.5 ? 0 : 1) : 2;
    }

    const symptom = symptomDescriptions[symptomIndex];

    const dailyEntry = await prisma.dailyEntry.create({
      data: {
        userId: user.id,
        date,
        notes: `Sample entry for ${date.toDateString()}`,
      },
    });

    // Create meals
    for (const [mealType, foods] of Object.entries(mealPattern)) {
      const meal = await prisma.meal.create({
        data: {
          dailyEntryId: dailyEntry.id,
          mealType,
        },
      });

      // Create food items
      for (let j = 0; j < foods.length; j++) {
        const foodText = foods[j];
        const foodItem = await prisma.foodItem.create({
          data: {
            mealId: meal.id,
            rawText: foodText,
            orderIndex: j,
            isDrink: mealType === 'drinks' || isDrink(foodText),
          },
        });
        await linkFoodItemConcepts(foodItem.id, foodText);
      }
    }

    // Create symptom record
    const severityMap: Record<string, string> = {
      great: 'none',
      good: 'mild',
      okay: 'moderate',
      bad: 'moderate',
      very_bad: 'severe',
    };

    await prisma.symptomRecord.create({
      data: {
        dailyEntryId: dailyEntry.id,
        freeTextNotes: symptom.text,
        overallRating: symptom.rating,
        bloating: severityMap[symptom.rating],
        gas: symptom.rating === 'very_bad' || symptom.rating === 'bad' ? 'moderate' : 'mild',
        crampsPain: symptom.rating === 'very_bad' ? 'severe' : symptom.rating === 'bad' ? 'moderate' : 'none',
        diarrhea: symptom.rating === 'very_bad',
        constipation: false,
      },
    });

    if (i % 5 === 0) {
      console.log(`  ✓ Created entry for ${date.toDateString()} (${symptom.rating})`);
    }
  }

  console.log('\n✅ Seeded 28 days of sample data!');
  console.log('\n📊 Summary:');
  console.log(`   - Test user: testuser / password123`);
  console.log(`   - ${28} daily entries with meals and symptoms`);
  console.log(`   - Mix of good and bad days with patterns`);
  console.log(`   - Foods with milk/dairy tend to have more symptoms`);
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
