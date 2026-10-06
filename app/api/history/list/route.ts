// API endpoint to list history entries with details

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { formatCalendarDate } from '@/lib/dates';

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const entries = await prisma.dailyEntry.findMany({
      where: { userId: session.userId },
      include: {
        meals: {
          include: {
            foodItems: true,
          },
        },
        symptomRecord: true,
      },
      orderBy: { date: 'desc' },
    });

    const formattedEntries = entries.map((entry) => {
      const foodItems = entry.meals.flatMap((meal) =>
        meal.foodItems.map((item) => item.rawText)
      );

      return {
        id: entry.id,
        date: formatCalendarDate(entry.date),
        overallRating: entry.symptomRecord?.overallRating || null,
        symptomNotes: entry.symptomRecord?.freeTextNotes || '',
        bloating: entry.symptomRecord?.bloating || null,
        foodItems,
      };
    });

    return NextResponse.json({ entries: formattedEntries });
  } catch (error) {
    console.error('List history error:', error);
    return NextResponse.json(
      { error: 'Failed to list history' },
      { status: 500 }
    );
  }
}
