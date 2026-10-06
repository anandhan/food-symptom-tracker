// Import JSON backup

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { validateImportData } from '@/lib/export';
import { parseCalendarDate } from '@/lib/dates';

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { data, overwrite } = body;

    const validation = validateImportData(data);
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    // Optionally wipe existing data
    if (overwrite) {
      await prisma.symptomEvent.deleteMany({
        where: {
          symptomRecord: {
            dailyEntry: {
              userId: session.userId,
            },
          },
        },
      });
      await prisma.symptomRecord.deleteMany({
        where: {
          dailyEntry: {
            userId: session.userId,
          },
        },
      });
      await prisma.foodItemConcept.deleteMany({
        where: {
          foodItem: {
            meal: {
              dailyEntry: {
                userId: session.userId,
              },
            },
          },
        },
      });
      await prisma.foodItem.deleteMany({
        where: {
          meal: {
            dailyEntry: {
              userId: session.userId,
            },
          },
        },
      });
      await prisma.meal.deleteMany({
        where: {
          dailyEntry: {
            userId: session.userId,
          },
        },
      });
      await prisma.ocrExtraction.deleteMany({
        where: {
          dailyEntry: {
            userId: session.userId,
          },
        },
      });
      await prisma.uploadedImage.deleteMany({
        where: {
          dailyEntry: {
            userId: session.userId,
          },
        },
      });
      await prisma.weeklyReport.deleteMany({
        where: {
          userId: session.userId,
        },
      });
      await prisma.dailyEntry.deleteMany({
        where: {
          userId: session.userId,
        },
      });
    }

    // Import entries
    let importedCount = 0;
    for (const entry of data.entries || []) {
      const dailyEntry = await prisma.dailyEntry.create({
        data: {
          userId: session.userId,
          date: parseCalendarDate(String(entry.date).slice(0, 10)),
          notes: entry.notes || null,
        },
      });

      // Import meals
      for (const meal of entry.meals || []) {
        const createdMeal = await prisma.meal.create({
          data: {
            dailyEntryId: dailyEntry.id,
            mealType: meal.mealType,
            notes: meal.notes || null,
          },
        });

        // Import food items
        for (const foodItem of meal.foodItems || []) {
          await prisma.foodItem.create({
            data: {
              mealId: createdMeal.id,
              rawText: foodItem.rawText,
              brand: foodItem.brand || null,
              foodName: foodItem.foodName || null,
              quantity: foodItem.quantity || null,
              orderIndex: foodItem.orderIndex || 0,
              isDrink: foodItem.isDrink || false,
              calories: foodItem.calories || null,
              carbs: foodItem.carbs || null,
              fat: foodItem.fat || null,
              protein: foodItem.protein || null,
              fiber: foodItem.fiber || null,
              sugar: foodItem.sugar || null,
            },
          });
        }
      }

      // Import symptoms
      if (entry.symptomRecord) {
        await prisma.symptomRecord.create({
          data: {
            dailyEntryId: dailyEntry.id,
            freeTextNotes: entry.symptomRecord.freeTextNotes || '',
            overallRating: entry.symptomRecord.overallRating || null,
            bloating: entry.symptomRecord.bloating || null,
            gas: entry.symptomRecord.gas || null,
            crampsPain: entry.symptomRecord.crampsPain || null,
            diarrhea: entry.symptomRecord.diarrhea || false,
            constipation: entry.symptomRecord.constipation || false,
          },
        });
      }

      importedCount++;
    }

    return NextResponse.json({
      success: true,
      importedEntries: importedCount,
    });
  } catch (error) {
    console.error('Import error:', error);
    return NextResponse.json(
      { error: 'Import failed', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}
