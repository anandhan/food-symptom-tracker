import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { linkUnlinkedFoodItemConcepts } from '@/lib/ai/food-normalization';
import { createWeeklyReportForUser } from '@/lib/analysis/weekly-report';
import {
  addCalendarDays,
  getCalendarDateInTimezone,
  getConfiguredTimezone,
  parseCalendarDate,
} from '@/lib/dates';

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret) {
      return NextResponse.json(
        { error: 'CRON_SECRET not configured' },
        { status: 500 }
      );
    }

    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    try {
      console.time('cron:concepts');
      await linkUnlinkedFoodItemConcepts({ limit: 200 });
      console.timeEnd('cron:concepts');
    } catch (error) {
      console.error('Cron concept backfill failed:', error);
    }

    const users = await prisma.user.findMany({
      select: { id: true, email: true },
    });

    const results = [];

    for (const user of users) {
      const timezone = getConfiguredTimezone();
      const todayIso = getCalendarDateInTimezone(new Date(), timezone);
      const endDate = parseCalendarDate(todayIso);
      const startDate = parseCalendarDate(addCalendarDays(todayIso, -6));

      const entryCount = await prisma.dailyEntry.count({
        where: {
          userId: user.id,
          date: { gte: startDate, lte: endDate },
        },
      });

      if (entryCount < 3) {
        continue;
      }

      const created = await createWeeklyReportForUser({
        userId: user.id,
        startDate,
        endDate,
      });

      results.push({
        userId: user.id,
        email: user.email,
        reportId: created.report.id,
        interpretationError: created.interpretation.error,
      });
    }

    return NextResponse.json({
      success: true,
      reportsGenerated: results.length,
      users: results,
    });
  } catch (error) {
    console.error('Cron job error:', error);
    return NextResponse.json(
      { error: 'Failed to generate reports', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  return POST(request);
}
