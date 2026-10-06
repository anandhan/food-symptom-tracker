// Dashboard aggregates: top foods, good/bad associations, trend, latest report

import { prisma } from '@/lib/db';
import { formatCalendarDate, parseCalendarDate, addCalendarDays } from '@/lib/dates';

export interface FoodCount {
  food: string;
  count: number;
}

export interface SymptomPoint {
  date: string;
  rating: string | null;
}

export async function getDashboardStats(userId: string, todayIso: string) {
  const today = parseCalendarDate(todayIso);
  const fourteenAgo = parseCalendarDate(addCalendarDays(todayIso, -13));
  const sevenAgo = parseCalendarDate(addCalendarDays(todayIso, -6));

  const [
    todayEntry,
    recentEntries,
    allEntries,
    totalDays,
    goodDays,
    badDays,
    latestReport,
  ] = await Promise.all([
    prisma.dailyEntry.findFirst({
      where: { userId, date: today },
      include: {
        meals: { include: { foodItems: true } },
        symptomRecord: true,
      },
    }),
    prisma.dailyEntry.findMany({
      where: { userId, date: { gte: sevenAgo, lte: today } },
      include: { symptomRecord: true },
      orderBy: { date: 'desc' },
    }),
    prisma.dailyEntry.findMany({
      where: { userId },
      include: {
        meals: { include: { foodItems: true } },
        symptomRecord: true,
      },
    }),
    prisma.dailyEntry.count({ where: { userId } }),
    prisma.symptomRecord.count({
      where: {
        dailyEntry: { userId },
        overallRating: { in: ['great', 'good'] },
      },
    }),
    prisma.symptomRecord.count({
      where: {
        dailyEntry: { userId },
        overallRating: { in: ['bad', 'very_bad'] },
      },
    }),
    prisma.weeklyReport.findFirst({
      where: { userId },
      orderBy: { generatedAt: 'desc' },
    }),
  ]);

  const foodCounts = new Map<string, number>();
  const foodOnBad = new Map<string, number>();
  const foodOnGood = new Map<string, number>();

  for (const entry of allEntries) {
    const rating = entry.symptomRecord?.overallRating || null;
    const foods = new Set<string>();
    for (const meal of entry.meals) {
      for (const item of meal.foodItems) {
        const key = item.rawText.trim();
        if (!key) continue;
        foods.add(key);
      }
    }
    for (const food of foods) {
      foodCounts.set(food, (foodCounts.get(food) || 0) + 1);
      if (rating === 'bad' || rating === 'very_bad') {
        foodOnBad.set(food, (foodOnBad.get(food) || 0) + 1);
      }
      if (rating === 'great' || rating === 'good') {
        foodOnGood.set(food, (foodOnGood.get(food) || 0) + 1);
      }
    }
  }

  const topBy = (map: Map<string, number>, n = 5): FoodCount[] =>
    [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([food, count]) => ({ food, count }));

  const trendEntries = await prisma.dailyEntry.findMany({
    where: { userId, date: { gte: fourteenAgo, lte: today } },
    include: { symptomRecord: true },
    orderBy: { date: 'asc' },
  });

  const symptomTrend: SymptomPoint[] = trendEntries.map((e) => ({
    date: formatCalendarDate(e.date),
    rating: e.symptomRecord?.overallRating || null,
  }));

  let latestReportParsed: {
    id: string;
    startDate: string;
    endDate: string;
    summaryText: string;
    generatedAt: string;
  } | null = null;

  if (latestReport) {
    latestReportParsed = {
      id: latestReport.id,
      startDate: formatCalendarDate(latestReport.startDate),
      endDate: formatCalendarDate(latestReport.endDate),
      summaryText: latestReport.summaryText,
      generatedAt: latestReport.generatedAt.toISOString(),
    };
  }

  return {
    todayIso,
    todayEntry,
    recentEntries,
    totalDays,
    goodDays,
    badDays,
    topFoods: topBy(foodCounts),
    foodsOnBadDays: topBy(foodOnBad),
    foodsOnGoodDays: topBy(foodOnGood),
    symptomTrend,
    latestReport: latestReportParsed,
  };
}
