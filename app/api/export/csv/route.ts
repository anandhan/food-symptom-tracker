// Export all user data as CSV (ZIP with multiple files)

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import JSZip from 'jszip';

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const zip = new JSZip();

    // Entries CSV
    const entries = await prisma.dailyEntry.findMany({
      where: { userId: session.userId },
      orderBy: { date: 'asc' },
    });

    const entriesCSV = [
      ['Date', 'Notes', 'Created At', 'Updated At'].join(','),
      ...entries.map((e) =>
        [
          e.date.toISOString().split('T')[0],
          `"${(e.notes || '').replace(/"/g, '""')}"`,
          e.createdAt.toISOString(),
          e.updatedAt.toISOString(),
        ].join(',')
      ),
    ].join('\n');
    zip.file('daily_entries.csv', entriesCSV);

    // Meals CSV
    const meals = await prisma.meal.findMany({
      where: {
        dailyEntry: {
          userId: session.userId,
        },
      },
      include: {
        dailyEntry: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    const mealsCSV = [
      ['Date', 'Meal Type', 'Notes'].join(','),
      ...meals.map((m) =>
        [
          m.dailyEntry.date.toISOString().split('T')[0],
          m.mealType,
          `"${(m.notes || '').replace(/"/g, '""')}"`,
        ].join(',')
      ),
    ].join('\n');
    zip.file('meals.csv', mealsCSV);

    // Food Items CSV
    const foodItems = await prisma.foodItem.findMany({
      where: {
        meal: {
          dailyEntry: {
            userId: session.userId,
          },
        },
      },
      include: {
        meal: {
          include: {
            dailyEntry: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    const foodItemsCSV = [
      [
        'Date',
        'Meal Type',
        'Food',
        'Brand',
        'Quantity',
        'Is Drink',
        'Calories',
        'Carbs',
        'Fat',
        'Protein',
        'Fiber',
        'Sugar',
      ].join(','),
      ...foodItems.map((f) =>
        [
          f.meal.dailyEntry.date.toISOString().split('T')[0],
          f.meal.mealType,
          `"${f.rawText.replace(/"/g, '""')}"`,
          `"${(f.brand || '').replace(/"/g, '""')}"`,
          `"${(f.quantity || '').replace(/"/g, '""')}"`,
          f.isDrink ? 'Yes' : 'No',
          f.calories || '',
          f.carbs || '',
          f.fat || '',
          f.protein || '',
          f.fiber || '',
          f.sugar || '',
        ].join(',')
      ),
    ].join('\n');
    zip.file('food_items.csv', foodItemsCSV);

    // Symptoms CSV
    const symptoms = await prisma.symptomRecord.findMany({
      where: {
        dailyEntry: {
          userId: session.userId,
        },
      },
      include: {
        dailyEntry: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    const symptomsCSV = [
      [
        'Date',
        'Overall Rating',
        'Notes',
        'Bloating',
        'Gas',
        'Cramps/Pain',
        'Diarrhea',
        'Constipation',
      ].join(','),
      ...symptoms.map((s) =>
        [
          s.dailyEntry.date.toISOString().split('T')[0],
          s.overallRating || '',
          `"${(s.freeTextNotes || '').replace(/"/g, '""')}"`,
          s.bloating || '',
          s.gas || '',
          s.crampsPain || '',
          s.diarrhea ? 'Yes' : 'No',
          s.constipation ? 'Yes' : 'No',
        ].join(',')
      ),
    ].join('\n');
    zip.file('symptoms.csv', symptomsCSV);

    // Food Concepts CSV
    const concepts = await prisma.foodConcept.findMany({
      where: {
        foodItemConcepts: {
          some: {
            foodItem: {
              meal: {
                dailyEntry: {
                  userId: session.userId,
                },
              },
            },
          },
        },
      },
    });

    const conceptsCSV = [
      ['Name', 'Category', 'Aliases', 'Active'].join(','),
      ...concepts.map((c) =>
        [
          `"${c.name.replace(/"/g, '""')}"`,
          `"${(c.category || '').replace(/"/g, '""')}"`,
          `"${c.aliases.replace(/"/g, '""')}"`,
          c.isActive ? 'Yes' : 'No',
        ].join(',')
      ),
    ].join('\n');
    zip.file('food_concepts.csv', conceptsCSV);

    // Generate ZIP
    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });

    return new NextResponse(zipBuffer, {
      headers: {
        'Content-Disposition': `attachment; filename="food-tracker-export-${Date.now()}.zip"`,
        'Content-Type': 'application/zip',
      },
    });
  } catch (error) {
    console.error('CSV export error:', error);
    return NextResponse.json(
      { error: 'CSV export failed', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}
