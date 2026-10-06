// API endpoint to save a complete daily entry with meals and symptoms

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { normalizeFoodItem, isDrink } from '@/lib/ai/food-normalization';
import { parseCalendarDate } from '@/lib/dates';

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      dailyEntryId,
      date,
      meals,
      symptomNotes,
      overallRating,
      bloating,
      gas,
      crampsPain,
      diarrhea,
      constipation,
    } = body;

    const entryDate = parseCalendarDate(date);

    // Create or get daily entry
    let dailyEntry;
    if (dailyEntryId) {
      dailyEntry = await prisma.dailyEntry.findUnique({
        where: { id: dailyEntryId },
      });
      
      if (!dailyEntry || dailyEntry.userId !== session.userId) {
        return NextResponse.json({ error: 'Invalid daily entry' }, { status: 403 });
      }
    } else {
      dailyEntry = await prisma.dailyEntry.upsert({
        where: {
          userId_date: {
            userId: session.userId,
            date: entryDate,
          },
        },
        update: {},
        create: {
          userId: session.userId,
          date: entryDate,
        },
      });
    }

    // Delete existing meals to replace them
    await prisma.meal.deleteMany({
      where: { dailyEntryId: dailyEntry.id },
    });

    // Save meals
    for (const [mealType, foodItems] of Object.entries(meals)) {
      if (!Array.isArray(foodItems) || foodItems.length === 0) continue;

      const meal = await prisma.meal.create({
        data: {
          dailyEntryId: dailyEntry.id,
          mealType,
        },
      });

      // Save food items
      for (let i = 0; i < foodItems.length; i++) {
        const item: any = foodItems[i];
        
        // Detect if it's a drink
        const itemIsDrink = item.is_drink ?? isDrink(item.text);

        const foodItem = await prisma.foodItem.create({
          data: {
            mealId: meal.id,
            rawText: item.text,
            brand: item.brand || null,
            foodName: item.food_name || null,
            quantity: item.quantity || null,
            isDrink: itemIsDrink,
            calories: item.calories || null,
            carbs: item.carbs || null,
            fat: item.fat || null,
            protein: item.protein || null,
            fiber: item.fiber || null,
            sugar: item.sugar || null,
            orderIndex: i,
          },
        });

        // Normalize to concepts (fire and forget - don't block on this)
        normalizeFoodItem(item.text, item.brand)
          .then(async (normalization) => {
            for (const concept of normalization.concepts) {
              await prisma.foodItemConcept.create({
                data: {
                  foodItemId: foodItem.id,
                  foodConceptId: concept.conceptId,
                  confidence: concept.confidence,
                  assignedBy: 'ai',
                },
              }).catch((err) => {
                // Ignore duplicate errors
                if (!err.message.includes('Unique constraint')) {
                  console.error('Failed to save concept:', err);
                }
              });
            }
          })
          .catch((err) => console.error('Normalization failed:', err));
      }
    }

    // Save or update symptom record
    if (symptomNotes) {
      await prisma.symptomRecord.upsert({
        where: { dailyEntryId: dailyEntry.id },
        update: {
          freeTextNotes: symptomNotes,
          overallRating: overallRating || null,
          bloating: bloating || null,
          gas: gas || null,
          crampsPain: crampsPain || null,
          diarrhea: diarrhea || false,
          constipation: constipation || false,
        },
        create: {
          dailyEntryId: dailyEntry.id,
          freeTextNotes: symptomNotes,
          overallRating: overallRating || null,
          bloating: bloating || null,
          gas: gas || null,
          crampsPain: crampsPain || null,
          diarrhea: diarrhea || false,
          constipation: constipation || false,
        },
      });
    }

    return NextResponse.json({ 
      success: true, 
      dailyEntryId: dailyEntry.id 
    });
  } catch (error) {
    console.error('Save entry error:', error);
    return NextResponse.json(
      { error: 'Failed to save entry', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
