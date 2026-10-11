import { createHash } from 'crypto';
import { prisma } from '@/lib/db';
import { formatCalendarDate } from '@/lib/dates';
import {
  analyzeConceptCombinations,
  analyzeFoodSymptomCorrelations,
  getMealTypeBreakdown,
  type CorrelationResult,
} from './correlation-engine';

export const INTERPRETATION_PROMPT_VERSION = 'v1';

export type CompactConceptStat = {
  concept: string;
  daysWithFood: number;
  daysWithFoodAndSymptoms: number;
  symptomRateWith: number;
  symptomRateWithout: number;
  relativeRisk: number;
  confidence: CorrelationResult['confidence'];
  label: string;
  evidence: string;
  sampleSize: number;
};

export type ObservedAnalysisSnapshot = {
  promptVersion: string;
  range: {
    start: string;
    end: string;
    daysTracked: number;
    totalDaysInPeriod: number;
  };
  ratings: {
    counts: Record<string, number>;
    goodDays: number;
    badDays: number;
  };
  concepts: CompactConceptStat[];
  lagWindows: {
    sameDay: CompactConceptStat[];
    nextDay: CompactConceptStat[];
  };
  mealSlots: Record<string, { total: number; withSymptoms: number; rate: number }>;
  combinations: Array<{
    concepts: [string, string];
    daysTogether: number;
    daysTogetherWithSymptoms: number;
    symptomRateTogether: number;
  }>;
  trends: {
    firstHalfBadRate: number;
    secondHalfBadRate: number;
    firstHalfDays: number;
    secondHalfDays: number;
  };
};

function compactConcept(row: CorrelationResult): CompactConceptStat {
  return {
    concept: row.foodConcept,
    daysWithFood: row.daysWithFood,
    daysWithFoodAndSymptoms: row.daysWithFoodAndSymptoms,
    symptomRateWith: Number(row.symptomRateWithFood.toFixed(3)),
    symptomRateWithout: Number(row.symptomRateWithoutFood.toFixed(3)),
    relativeRisk: Number(row.relativeRisk.toFixed(2)),
    confidence: row.confidence,
    label: row.label,
    evidence: row.evidence,
    sampleSize: row.daysWithFood,
  };
}

function topByRelevance(rows: CorrelationResult[], limit: number): CompactConceptStat[] {
  return rows
    .slice()
    .sort((a, b) => Math.abs(b.relativeRisk - 1) - Math.abs(a.relativeRisk - 1))
    .slice(0, limit)
    .map(compactConcept);
}

export function hashObservedSnapshot(snapshot: unknown): string {
  return createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
}

export async function buildObservedAnalysisSnapshot(options: {
  userId: string;
  startDate: Date;
  endDate: Date;
}): Promise<ObservedAnalysisSnapshot> {
  const { userId, startDate, endDate } = options;
  const [sameDay, nextDay, mealBreakdown, combinations, entries] = await Promise.all([
    analyzeFoodSymptomCorrelations({
      userId,
      startDate,
      endDate,
      lagDays: 0,
      level: 'concept',
    }),
    analyzeFoodSymptomCorrelations({
      userId,
      startDate,
      endDate,
      lagDays: 1,
      level: 'concept',
    }),
    getMealTypeBreakdown(userId, startDate, endDate),
    analyzeConceptCombinations({ userId, startDate, endDate, level: 'concept' }),
    prisma.dailyEntry.findMany({
      where: { userId, date: { gte: startDate, lte: endDate } },
      include: { symptomRecord: true },
      orderBy: { date: 'asc' },
    }),
  ]);

  const ratingCounts: Record<string, number> = {
    great: 0,
    good: 0,
    okay: 0,
    bad: 0,
    very_bad: 0,
  };
  entries.forEach((entry) => {
    const rating = entry.symptomRecord?.overallRating;
    if (rating && ratingCounts[rating] !== undefined) ratingCounts[rating] += 1;
  });

  const midpoint = Math.floor(entries.length / 2);
  const halfRate = (slice: typeof entries) => {
    if (slice.length === 0) return 0;
    const bad = slice.filter((entry) => {
      const rating = entry.symptomRecord?.overallRating;
      return rating === 'bad' || rating === 'very_bad';
    }).length;
    return Number((bad / slice.length).toFixed(3));
  };

  const mealSlots: ObservedAnalysisSnapshot['mealSlots'] = {};
  for (const [meal, stats] of Object.entries(mealBreakdown)) {
    mealSlots[meal] = {
      total: stats.total,
      withSymptoms: stats.withSymptoms,
      rate: stats.total > 0 ? Number((stats.withSymptoms / stats.total).toFixed(3)) : 0,
    };
  }

  const totalDaysInPeriod = Math.max(
    1,
    Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1
  );

  return {
    promptVersion: INTERPRETATION_PROMPT_VERSION,
    range: {
      start: formatCalendarDate(startDate),
      end: formatCalendarDate(endDate),
      daysTracked: entries.length,
      totalDaysInPeriod,
    },
    ratings: {
      counts: ratingCounts,
      goodDays: ratingCounts.great + ratingCounts.good,
      badDays: ratingCounts.bad + ratingCounts.very_bad,
    },
    concepts: topByRelevance(sameDay, 20),
    lagWindows: {
      sameDay: topByRelevance(sameDay, 12),
      nextDay: topByRelevance(nextDay, 12),
    },
    mealSlots,
    combinations: combinations.map((row) => ({
      concepts: row.concepts,
      daysTogether: row.daysTogether,
      daysTogetherWithSymptoms: row.daysTogetherWithSymptoms,
      symptomRateTogether: Number(row.symptomRateTogether.toFixed(3)),
    })),
    trends: {
      firstHalfBadRate: halfRate(entries.slice(0, midpoint)),
      secondHalfBadRate: halfRate(entries.slice(midpoint)),
      firstHalfDays: midpoint,
      secondHalfDays: entries.length - midpoint,
    },
  };
}
