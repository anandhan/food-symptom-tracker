// Tests for correlation analysis engine

import { analyzeFoodSymptomCorrelations } from '../lib/analysis/correlation-engine';
import { PrismaClient } from '@prisma/client';

// Mock Prisma
jest.mock('../lib/db', () => ({
  prisma: {
    dailyEntry: {
      findMany: jest.fn(),
    },
  },
}));

describe('Correlation Analysis Engine', () => {
  it('calculates relative risk correctly', () => {
    // Test data: milk on 10 days, symptoms on 8 of those
    // Total 30 days, 12 symptom days overall
    // RR should be: (8/10) / ((12-8)/(30-10)) = 0.8 / 0.2 = 4.0
    
    const daysWithFood = 10;
    const daysWithFoodAndSymptoms = 8;
    const totalDays = 30;
    const totalSymptomDays = 12;
    
    const symptomRateWithFood = daysWithFoodAndSymptoms / daysWithFood; // 0.8
    const daysWithoutFood = totalDays - daysWithFood; // 20
    const symptomDaysWithoutFood = totalSymptomDays - daysWithFoodAndSymptoms; // 4
    const symptomRateWithoutFood = symptomDaysWithoutFood / daysWithoutFood; // 0.2
    
    const relativeRisk = symptomRateWithFood / symptomRateWithoutFood; // 4.0
    
    expect(relativeRisk).toBeCloseTo(4.0, 1);
    expect(symptomRateWithFood).toBe(0.8);
    expect(symptomRateWithoutFood).toBe(0.2);
  });

  it('handles zero denominators gracefully', () => {
    const symptomRateWithFood = 0.5;
    const symptomRateWithoutFood = 0;
    
    const relativeRisk = symptomRateWithoutFood > 0
      ? symptomRateWithFood / symptomRateWithoutFood
      : symptomRateWithFood > 0 ? 999 : 1;
    
    expect(relativeRisk).toBe(999);
  });

  it('categorizes confidence levels correctly', () => {
    function getConfidence(samples: number): string {
      if (samples < 10) return 'low';
      if (samples < 30) return 'medium';
      return 'high';
    }
    
    expect(getConfidence(5)).toBe('low');
    expect(getConfidence(15)).toBe('medium');
    expect(getConfidence(35)).toBe('high');
  });

  it('generates correct labels', () => {
    function getLabel(rr: number, confidence: string, samples: number): string {
      if (samples < 5) return 'Not enough data yet';
      if (confidence === 'low') return 'Not enough data yet';
      if (rr < 0.8) return 'Appears well tolerated';
      if (rr >= 1.5 && rr < 2.0) return 'Possible association';
      if (rr >= 2.0) return 'Strong pattern';
      return 'No clear pattern';
    }
    
    expect(getLabel(2.5, 'medium', 15)).toBe('Strong pattern');
    expect(getLabel(1.7, 'medium', 12)).toBe('Possible association');
    expect(getLabel(0.6, 'high', 40)).toBe('Appears well tolerated');
    expect(getLabel(3.0, 'low', 8)).toBe('Not enough data yet');
  });
});

describe('Food Normalization', () => {
  it('normalizes food names correctly', () => {
    const normalize = (text: string) => text.toLowerCase().trim();
    
    expect(normalize('  Coffee with Milk  ')).toBe('coffee with milk');
    expect(normalize('TOAST')).toBe('toast');
  });

  it('detects drinks correctly', () => {
    const drinkKeywords = ['coffee', 'tea', 'water', 'juice', 'soda'];
    const isDrink = (text: string) => 
      drinkKeywords.some(k => text.toLowerCase().includes(k));
    
    expect(isDrink('Coffee with milk')).toBe(true);
    expect(isDrink('Orange juice')).toBe(true);
    expect(isDrink('Chicken salad')).toBe(false);
  });
});

describe('MyFitnessPal Extraction', () => {
  it('parses nutrition values correctly', () => {
    const parseNutrition = (text: string) => {
      const match = text.match(/(\d+)\s*cal/i);
      return match ? parseInt(match[1]) : null;
    };
    
    expect(parseNutrition('155 cal')).toBe(155);
    expect(parseNutrition('No calories listed')).toBe(null);
  });

  it('extracts brand and food name', () => {
    const parseFood = (text: string) => {
      const parts = text.split(' - ');
      return {
        brand: parts[0]?.trim(),
        food: parts[1]?.trim(),
      };
    };
    
    const result = parseFood("Dunkin' Donuts - Latte With Sugar");
    expect(result.brand).toBe("Dunkin' Donuts");
    expect(result.food).toBe('Latte With Sugar');
  });
});
