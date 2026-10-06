// API endpoint to generate weekly report

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { analyzeFoodSymptomCorrelations } from '@/lib/analysis/correlation-engine';
import { parseCalendarDate } from '@/lib/dates';

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { startDate: startDateStr, endDate: endDateStr } = await request.json();
    const startDate = parseCalendarDate(String(startDateStr).slice(0, 10));
    const endDate = parseCalendarDate(String(endDateStr).slice(0, 10));

    // Gather observed data
    const entries = await prisma.dailyEntry.findMany({
      where: {
        userId: session.userId,
        date: { gte: startDate, lte: endDate },
      },
      include: {
        meals: {
          include: {
            foodItems: true,
          },
        },
        symptomRecord: true,
      },
      orderBy: { date: 'asc' },
    });

    // Calculate statistics
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

    // Run correlation analysis
    const correlations = await analyzeFoodSymptomCorrelations({
      userId: session.userId,
      startDate,
      endDate,
    });

    const problematicFoods = correlations
      .filter((r) => r.relativeRisk >= 1.5 && r.daysWithFood >= 3)
      .slice(0, 5);
    
    const wellToleratedFoods = correlations
      .filter((r) => r.relativeRisk < 0.8 && r.daysWithFood >= 5)
      .slice(0, 5);

    // Create observed data summary
    const observedData = {
      daysTracked: entries.length,
      totalDaysInPeriod: Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)),
      ratingCounts,
      topFoods,
      goodDays: ratingCounts.great + ratingCounts.good,
      badDays: ratingCounts.bad + ratingCounts.very_bad,
    };

    // Create AI interpretation (simple version without actual LLM)
    const aiInterpretation = {
      summary: `Week of ${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()}: ${
        observedData.goodDays > observedData.badDays ? 'Mostly positive' : 'Mixed'
      } week with ${observedData.goodDays} good days and ${observedData.badDays} bad days.`,
      patternsThisWeek: problematicFoods.map((f) => 
        `${f.foodConcept} showed ${f.label.toLowerCase()} (RR: ${f.relativeRisk.toFixed(1)}x)`
      ),
      foodsToConsiderReducing: problematicFoods.map((f) => ({
        food: f.foodConcept,
        reason: f.evidence.split('.').slice(0, 2).join('.'),
      })),
      foodsAppearingWellTolerated: wellToleratedFoods.map((f) => ({
        food: f.foodConcept,
        reason: `Eaten ${f.daysWithFood} times with low symptom rate`,
      })),
      recommendations: problematicFoods.length > 0
        ? [`Consider reducing intake of ${problematicFoods[0].foodConcept}`, 'Continue tracking to gather more data']
        : ['Continue current diet', 'Keep tracking for patterns'],
    };

    // Save report
    const report = await prisma.weeklyReport.create({
      data: {
        userId: session.userId,
        startDate,
        endDate,
        summaryText: aiInterpretation.summary,
        observedData: JSON.stringify(observedData),
        aiInterpretation: JSON.stringify(aiInterpretation),
        modelName: 'deterministic',
        modelVersion: '1.0',
      },
    });

    return NextResponse.json({ reportId: report.id, report });
  } catch (error) {
    console.error('Report generation error:', error);
    return NextResponse.json(
      { error: 'Failed to generate report', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
