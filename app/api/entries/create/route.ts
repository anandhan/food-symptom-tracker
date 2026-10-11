// API endpoint to create a daily entry

import { NextRequest, NextResponse } from 'next/server';
import { getAuthorizedSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { parseCalendarDate } from '@/lib/dates';

export async function POST(request: NextRequest) {
  try {
    const session = await getAuthorizedSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { date } = await request.json();
    
    if (!date) {
      return NextResponse.json({ error: 'Date is required' }, { status: 400 });
    }

    const entryDate = parseCalendarDate(date);

    // Check if entry already exists
    let dailyEntry = await prisma.dailyEntry.findFirst({
      where: {
        userId: session.userId,
        date: entryDate,
      },
    });

    // Create if doesn't exist
    if (!dailyEntry) {
      dailyEntry = await prisma.dailyEntry.create({
        data: {
          userId: session.userId,
          date: entryDate,
        },
      });
    }

    return NextResponse.json({ dailyEntryId: dailyEntry.id });
  } catch (error) {
    console.error('Create entry error:', error);
    return NextResponse.json(
      { error: 'Failed to create entry', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
