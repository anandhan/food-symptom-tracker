// Food-symptom correlation analysis engine

import { prisma } from '@/lib/db';
import { formatCalendarDate } from '@/lib/dates';
import { inferConceptNames } from '@/lib/ai/food-normalization';

export interface CorrelationResult {
  foodConcept: string;
  totalDays: number;
  daysWithFood: number;
  daysWithSymptoms: number;
  daysWithFoodAndSymptoms: number;
  symptomRateWithFood: number;
  symptomRateWithoutFood: number;
  relativeRisk: number;
  confidence: 'low' | 'medium' | 'high';
  label: string;
  evidence: string;
}

interface AnalysisOptions {
  userId: string;
  startDate?: Date;
  endDate?: Date;
  lagDays?: number;
  /** Raw food lines vs canonical ingredients (coffee, milk, …). */
  level?: 'item' | 'concept';
}

function conceptKeysForItem(item: {
  rawText: string;
  brand?: string | null;
  foodItemConcepts?: Array<{
    foodConcept: { name: string; isActive: boolean; mergedIntoId: string | null };
  }>;
}): string[] {
  const names = (item.foodItemConcepts || [])
    .filter((link) => link.foodConcept?.isActive && !link.foodConcept.mergedIntoId)
    .map((link) => link.foodConcept.name.toLowerCase());
  if (names.length > 0) return [...new Set(names)];
  return inferConceptNames(item.rawText, item.brand || undefined);
}

function getConfidenceLevel(samples: number): 'low' | 'medium' | 'high' {
  if (samples < 10) return 'low';
  if (samples < 30) return 'medium';
  return 'high';
}

function getLabel(rr: number, confidence: string, samples: number): string {
  if (samples < 5) return 'Not enough data yet';
  if (confidence === 'low') return 'Not enough data yet';
  if (rr < 0.8) return 'Appears well tolerated';
  if (rr >= 1.5 && rr < 2.0) return 'Possible association';
  if (rr >= 2.0) return 'Strong pattern';
  return 'No clear pattern';
}

export async function analyzeFoodSymptomCorrelations(
  options: AnalysisOptions
): Promise<CorrelationResult[]> {
  const { userId, startDate, endDate, lagDays = 0, level = 'item' } = options;

  // Build date filter
  const dateFilter: any = {};
  if (startDate) dateFilter.gte = startDate;
  if (endDate) dateFilter.lte = endDate;

  // Get all entries in range
  const entries = await prisma.dailyEntry.findMany({
    where: {
      userId,
      ...(Object.keys(dateFilter).length > 0 ? { date: dateFilter } : {}),
    },
    include: {
      meals: {
        include: {
          foodItems: {
            include: {
              foodItemConcepts: {
                include: { foodConcept: true },
              },
            },
          },
        },
      },
      symptomRecord: true,
    },
    orderBy: { date: 'asc' },
  });

  const totalDays = entries.length;
  if (totalDays < 5) {
    return []; // Not enough data
  }

  // Build food occurrence map
  const foodOccurrences: Map<string, Set<string>> = new Map(); // food -> set of entry dates
  
  entries.forEach((entry) => {
    const dateKey = formatCalendarDate(entry.date);
    entry.meals.forEach((meal) => {
      meal.foodItems.forEach((item) => {
        const keys =
          level === 'concept'
            ? conceptKeysForItem(item)
            : [item.rawText.toLowerCase().trim()].filter(Boolean);
        for (const foodKey of keys) {
          if (!foodOccurrences.has(foodKey)) {
            foodOccurrences.set(foodKey, new Set());
          }
          foodOccurrences.get(foodKey)!.add(dateKey);
        }
      });
    });
  });

  // Build symptom day map (considering lag)
  const symptomDays = new Set<string>();
  entries.forEach((entry, index) => {
    const targetIndex = index + lagDays;
    if (targetIndex < entries.length) {
      const targetEntry = entries[targetIndex];
      const hasBadSymptoms = 
        targetEntry.symptomRecord?.overallRating === 'bad' ||
        targetEntry.symptomRecord?.overallRating === 'very_bad' ||
        targetEntry.symptomRecord?.bloating === 'moderate' ||
        targetEntry.symptomRecord?.bloating === 'severe' ||
        targetEntry.symptomRecord?.crampsPain === 'moderate' ||
        targetEntry.symptomRecord?.crampsPain === 'severe';
      
      if (hasBadSymptoms) {
        symptomDays.add(formatCalendarDate(entry.date));
      }
    }
  });

  const totalSymptomDays = symptomDays.size;

  // Calculate correlations for each food
  const results: CorrelationResult[] = [];

  for (const [food, dateDays] of foodOccurrences.entries()) {
    const daysWithFood = dateDays.size;
    
    // Skip if not enough occurrences
    if (daysWithFood < 3) continue;

    // Count days with both food and symptoms
    let daysWithFoodAndSymptoms = 0;
    for (const date of dateDays) {
      if (symptomDays.has(date)) {
        daysWithFoodAndSymptoms++;
      }
    }

    // Calculate rates
    const symptomRateWithFood = daysWithFood > 0 
      ? daysWithFoodAndSymptoms / daysWithFood 
      : 0;
    
    const daysWithoutFood = totalDays - daysWithFood;
    const symptomDaysWithoutFood = totalSymptomDays - daysWithFoodAndSymptoms;
    const symptomRateWithoutFood = daysWithoutFood > 0
      ? symptomDaysWithoutFood / daysWithoutFood
      : 0;

    // Calculate relative risk
    const relativeRisk = symptomRateWithoutFood > 0
      ? symptomRateWithFood / symptomRateWithoutFood
      : symptomRateWithFood > 0 ? 999 : 1;

    const confidence = getConfidenceLevel(daysWithFood);
    const label = getLabel(relativeRisk, confidence, daysWithFood);

    // Build evidence string
    const evidence = `${food} appeared on ${daysWithFood} out of ${totalDays} days. ` +
      `Symptoms occurred on ${daysWithFoodAndSymptoms} of those ${daysWithFood} days ` +
      `(${(symptomRateWithFood * 100).toFixed(0)}%). ` +
      `On days without ${food}, symptoms occurred ${(symptomRateWithoutFood * 100).toFixed(0)}% of the time. ` +
      `Sample size: ${daysWithFood} days (${confidence} confidence).`;

    results.push({
      foodConcept: food,
      totalDays,
      daysWithFood,
      daysWithSymptoms: totalSymptomDays,
      daysWithFoodAndSymptoms,
      symptomRateWithFood,
      symptomRateWithoutFood,
      relativeRisk,
      confidence,
      label,
      evidence,
    });
  }

  // Sort by relative risk descending
  results.sort((a, b) => {
    // Prioritize high-confidence high-risk items
    if (a.confidence !== b.confidence) {
      const confOrder = { high: 3, medium: 2, low: 1 };
      return confOrder[b.confidence] - confOrder[a.confidence];
    }
    return b.relativeRisk - a.relativeRisk;
  });

  return results;
}

export async function getMealTypeBreakdown(userId: string, startDate?: Date, endDate?: Date) {
  const dateFilter: any = {};
  if (startDate) dateFilter.gte = startDate;
  if (endDate) dateFilter.lte = endDate;

  const entries = await prisma.dailyEntry.findMany({
    where: {
      userId,
      ...(Object.keys(dateFilter).length > 0 ? { date: dateFilter } : {}),
    },
    include: {
      meals: true,
      symptomRecord: true,
    },
  });

  const breakdown: Record<string, { total: number; withSymptoms: number }> = {
    breakfast: { total: 0, withSymptoms: 0 },
    lunch: { total: 0, withSymptoms: 0 },
    dinner: { total: 0, withSymptoms: 0 },
    snacks: { total: 0, withSymptoms: 0 },
  };

  entries.forEach((entry) => {
    const hasBadSymptoms =
      entry.symptomRecord?.overallRating === 'bad' ||
      entry.symptomRecord?.overallRating === 'very_bad';

    entry.meals.forEach((meal) => {
      if (breakdown[meal.mealType]) {
        breakdown[meal.mealType].total++;
        if (hasBadSymptoms) {
          breakdown[meal.mealType].withSymptoms++;
        }
      }
    });
  });

  return breakdown;
}
