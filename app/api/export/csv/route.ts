// Export all user data as CSV (ZIP with multiple files)

import { NextRequest, NextResponse } from 'next/server';
import { getAuthorizedSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import JSZip from 'jszip';
import { formatCalendarDate } from '@/lib/dates';
import { rowsToCsv } from '@/lib/export';

export async function GET(request: NextRequest) {
  try {
    const session = await getAuthorizedSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const zip = new JSZip();

    // Entries CSV
    const entries = await prisma.dailyEntry.findMany({
      where: { userId: session.userId },
      orderBy: { date: 'asc' },
    });

    const entriesCSV = rowsToCsv(
      ['Date', 'Notes', 'Created At', 'Updated At'],
      entries.map((e) => [
        formatCalendarDate(e.date),
        e.notes || '',
        e.createdAt.toISOString(),
        e.updatedAt.toISOString(),
      ])
    );
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
          formatCalendarDate(m.dailyEntry.date),
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
          formatCalendarDate(f.meal.dailyEntry.date),
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
          formatCalendarDate(s.dailyEntry.date),
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

    return new NextResponse(zipBuffer as any, {
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
