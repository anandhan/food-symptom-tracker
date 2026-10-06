// API endpoint for weekly report cron job

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { analyzeFoodSymptomCorrelations } from '@/lib/analysis/correlation-engine';
import {
  addCalendarDays,
  getCalendarDateInTimezone,
  getConfiguredTimezone,
  parseCalendarDate,
} from '@/lib/dates';

export async function POST(request: NextRequest) {
  try {
    // Verify CRON_SECRET for security
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

    // Get all users
    const users = await prisma.user.findMany({
      select: { id: true, email: true },
    });

    const results = [];

    // Generate reports for each user
    for (const user of users) {
      const timezone = getConfiguredTimezone();
      const todayIso = getCalendarDateInTimezone(new Date(), timezone);
      const endDate = parseCalendarDate(todayIso);
      const startDate = parseCalendarDate(addCalendarDays(todayIso, -6));

      // Check if they have enough entries
      const entryCount = await prisma.dailyEntry.count({
        where: {
          userId: user.id,
          date: { gte: startDate, lte: endDate },
        },
      });

      if (entryCount < 3) {
        continue; // Skip users with < 3 entries this week
      }

      // Generate report
      const entries = await prisma.dailyEntry.findMany({
        where: {
          userId: user.id,
          date: { gte: startDate, lte: endDate },
        },
        include: {
          meals: { include: { foodItems: true } },
          symptomRecord: true,
        },
      });

      const foodCounts: Record<string, number> = {};
      const ratingCounts: Record<string, number> = {
        great: 0,
        good: 0,
        okay: 0,
        bad: 0,
        very_bad: 0,
      };

      entries.forEach((entry) => {
        entry.meals.forEach((meal) => {
          meal.foodItems.forEach((item) => {
            const food = item.rawText.toLowerCase();
            foodCounts[food] = (foodCounts[food] || 0) + 1;
          });
        });

        if (entry.symptomRecord?.overallRating) {
          ratingCounts[entry.symptomRecord.overallRating]++;
        }
      });

      const topFoods = Object.entries(foodCounts)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 10)
        .map(([food, count]) => ({ food, count }));

      const correlations = await analyzeFoodSymptomCorrelations({
        userId: user.id,
        startDate,
        endDate,
      });

      const problematicFoods = correlations
        .filter((r) => r.relativeRisk >= 1.5 && r.daysWithFood >= 3)
        .slice(0, 5);

      const observedData = {
        daysTracked: entries.length,
        totalDaysInPeriod: 7,
        ratingCounts,
        topFoods,
        goodDays: ratingCounts.great + ratingCounts.good,
        badDays: ratingCounts.bad + ratingCounts.very_bad,
      };

      const aiInterpretation = {
        summary: `Week of ${todayIso} (${timezone}): ${
          observedData.goodDays > observedData.badDays ? 'Mostly positive' : 'Mixed'
        } week`,
        patternsThisWeek: problematicFoods.map((f) => `${f.foodConcept} (RR: ${f.relativeRisk.toFixed(1)}x)`),
        recommendations: problematicFoods.length > 0
          ? [`Consider monitoring ${problematicFoods[0].foodConcept}`]
          : ['Continue current diet'],
      };

      await prisma.weeklyReport.create({
        data: {
          userId: user.id,
          startDate,
          endDate,
          summaryText: aiInterpretation.summary,
          observedData: JSON.stringify(observedData),
          aiInterpretation: JSON.stringify(aiInterpretation),
          modelName: 'deterministic',
          modelVersion: '1.0',
        },
      });

      results.push({ userId: user.id, email: user.email });
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

// Also allow GET for manual testing (with same auth)
export async function GET(request: NextRequest) {
  return POST(request);
}
