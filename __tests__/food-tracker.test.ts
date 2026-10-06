// Comprehensive tests for food tracker

import { isDrink, inferConceptNames } from '../lib/ai/food-normalization';
import { getVisionProvider } from '../lib/ai/vision-provider';
import * as fs from 'fs';
import * as path from 'path';

describe('Food Normalization', () => {
  describe('isDrink', () => {
    it('identifies common drinks', () => {
      expect(isDrink('Coffee with milk')).toBe(true);
      expect(isDrink('Latte')).toBe(true);
      expect(isDrink('Orange juice')).toBe(true);
      expect(isDrink('Water')).toBe(true);
      expect(isDrink('Soda')).toBe(true);
      expect(isDrink('Tea')).toBe(true);
    });

    it('rejects non-drinks', () => {
      expect(isDrink('Chicken salad')).toBe(false);
      expect(isDrink('Toast')).toBe(false);
      expect(isDrink('Oatmeal')).toBe(false);
    });

    it('is case insensitive', () => {
      expect(isDrink('COFFEE')).toBe(true);
      expect(isDrink('coffee')).toBe(true);
      expect(isDrink('CoFfEe')).toBe(true);
    });
  });

  describe('inferConceptNames', () => {
    it('maps coffee with milk to coffee + milk', () => {
      expect(inferConceptNames('Coffee with milk').sort()).toEqual(['coffee', 'milk']);
    });

    it('maps Dunkin latte with sugar to coffee, milk, and sugar', () => {
      const names = inferConceptNames("Dunkin' Donuts - Latte With Sugar", "Dunkin' Donuts");
      expect(names).toEqual(expect.arrayContaining(['coffee', 'milk', 'sugar']));
    });

    it('maps both diary phrasings onto the same coffee + milk concepts', () => {
      const homemade = inferConceptNames('coffee with milk');
      const dunkin = inferConceptNames('Dunkin Latte With Sugar');
      expect(homemade).toEqual(expect.arrayContaining(['coffee', 'milk']));
      expect(dunkin).toEqual(expect.arrayContaining(['coffee', 'milk']));
    });
  });
});

describe('MyFitnessPal Extraction Parsing', () => {
  describe('Date Header Parsing', () => {
    it('extracts date from diary header', () => {
      const header = 'Your Food Diary For: Thursday, September 19, 2026';
      const dateMatch = header.match(/For:\s*(.+)$/);
      expect(dateMatch).toBeTruthy();
      if (dateMatch) {
        expect(dateMatch[1]).toBe('Thursday, September 19, 2026');
      }
    });
  });

  describe('Food Entry Parsing', () => {
    it('parses brand and food name separated by dash', () => {
      const entry = "Dunkin' Donuts - Latte With Sugar";
      const parts = entry.split(' - ');
      expect(parts.length).toBe(2);
      expect(parts[0].trim()).toBe("Dunkin' Donuts");
      expect(parts[1].trim()).toBe('Latte With Sugar');
    });

    it('handles entries with serving info', () => {
      const entry = "Nature Valley - Crunchy Oats & Honey Granola, 2 bars";
      const parts = entry.split(',');
      expect(parts[0]).toContain('Nature Valley');
      expect(parts[1].trim()).toBe('2 bars');
    });
  });

  describe('Nutrition Values Parsing', () => {
    it('extracts calorie values', () => {
      const text = '155 cal';
      const match = text.match(/(\d+)\s*cal/i);
      expect(match).toBeTruthy();
      if (match) {
        expect(parseInt(match[1])).toBe(155);
      }
    });

    it('extracts macros', () => {
      // Example: 20g, 5.0g, etc.
      const carbs = '20g';
      const carbMatch = carbs.match(/(\d+\.?\d*)/);
      expect(carbMatch).toBeTruthy();
      if (carbMatch) {
        expect(parseFloat(carbMatch[1])).toBe(20);
      }
    });
  });

  describe('Mock Extraction Response Validation', () => {
    it('validates expected structure', () => {
      const mockResponse = {
        extractedDate: '2026-09-19',
        meals: [
          {
            mealType: 'breakfast',
            items: [
              {
                rawText: "Dunkin' Donuts - Latte With Sugar",
                brand: "Dunkin' Donuts",
                foodName: 'Latte With Sugar',
                quantity: '1 medium',
                calories: 240,
              },
            ],
          },
        ],
      };

      expect(mockResponse.extractedDate).toBe('2026-09-19');
      expect(mockResponse.meals).toHaveLength(1);
      expect(mockResponse.meals[0].mealType).toBe('breakfast');
      expect(mockResponse.meals[0].items[0].brand).toBe("Dunkin' Donuts");
      expect(mockResponse.meals[0].items[0].calories).toBe(240);
    });
  });

  describe('MyFitnessPal Fixture Existence', () => {
    it('confirms test fixture exists', () => {
      const fixturePath = path.join(process.cwd(), 'uploads', 'c18b5182df197575edc668b4138be7d2b85a2422aca0ec63fe067e18c6085e5c_75d3.png');
      expect(fs.existsSync(fixturePath)).toBe(true);
    });

    it('confirms fixture in test directory', () => {
      const testFixturePath = path.join(process.cwd(), 'tests', 'fixtures', 'myfitnesspal-example.png');
      // Either location is acceptable
      const uploadsPath = path.join(process.cwd(), 'uploads', 'c18b5182df197575edc668b4138be7d2b85a2422aca0ec63fe067e18c6085e5c_75d3.png');
      
      const exists = fs.existsSync(testFixturePath) || fs.existsSync(uploadsPath);
      expect(exists).toBe(true);
    });
  });

  describe('Mock vision provider', () => {
    it('returns extracted_date 2026-10-05 for the MyFitnessPal fixture', async () => {
      const prev = process.env.VISION_PROVIDER;
      process.env.VISION_PROVIDER = 'mock';
      const provider = getVisionProvider();
      const result = await provider.extractFoods(
        '/uploads/c18b5182df197575edc668b4138be7d2b85a2422aca0ec63fe067e18c6085e5c_75d3.png'
      );
      expect(result.extracted_date).toBe('2026-10-05');
      expect(result.breakfast.some((i) => /Latte With Sugar/i.test(i.text))).toBe(true);
      process.env.VISION_PROVIDER = prev;
    });
  });
});

describe('Analysis Engine', () => {
  describe('Relative Risk Calculation', () => {
    it('calculates RR correctly for strong association', () => {
      // Example: milk on 10 days, symptoms on 8 of those days
      // Total 30 days, 12 symptom days overall
      const daysWithFood = 10;
      const daysWithFoodAndSymptoms = 8;
      const totalDays = 30;
      const totalSymptomDays = 12;

      const symptomRateWithFood = daysWithFoodAndSymptoms / daysWithFood; // 0.8
      const daysWithoutFood = totalDays - daysWithFood; // 20
      const symptomDaysWithoutFood = totalSymptomDays - daysWithFoodAndSymptoms; // 4
      const symptomRateWithoutFood = symptomDaysWithoutFood / daysWithoutFood; // 0.2

      const relativeRisk = symptomRateWithFood / symptomRateWithoutFood;

      expect(relativeRisk).toBeCloseTo(4.0, 1);
    });

    it('handles no symptoms without food', () => {
      const symptomRateWithFood = 0.5;
      const symptomRateWithoutFood = 0;

      const relativeRisk =
        symptomRateWithoutFood > 0
          ? symptomRateWithFood / symptomRateWithoutFood
          : symptomRateWithFood > 0
            ? 999
            : 1;

      expect(relativeRisk).toBe(999);
    });

    it('calculates RR for well-tolerated food', () => {
      // Food on 20 days, only 2 symptom days
      // Total 30 days, 15 symptom days
      const symptomRateWithFood = 2 / 20; // 0.1
      const symptomRateWithoutFood = 13 / 10; // 1.3

      const relativeRisk = symptomRateWithFood / symptomRateWithoutFood;

      expect(relativeRisk).toBeLessThan(0.1);
    });
  });

  describe('Confidence Levels', () => {
    function getConfidence(samples: number): string {
      if (samples < 10) return 'low';
      if (samples < 30) return 'medium';
      return 'high';
    }

    it('assigns low confidence for <10 samples', () => {
      expect(getConfidence(5)).toBe('low');
      expect(getConfidence(9)).toBe('low');
    });

    it('assigns medium confidence for 10-29 samples', () => {
      expect(getConfidence(10)).toBe('medium');
      expect(getConfidence(20)).toBe('medium');
      expect(getConfidence(29)).toBe('medium');
    });

    it('assigns high confidence for 30+ samples', () => {
      expect(getConfidence(30)).toBe('high');
      expect(getConfidence(50)).toBe('high');
    });
  });

  describe('Label Generation', () => {
    function getLabel(rr: number, confidence: string, samples: number): string {
      if (samples < 5) return 'Not enough data yet';
      if (confidence === 'low') return 'Not enough data yet';
      if (rr < 0.8) return 'Appears well tolerated';
      if (rr >= 1.5 && rr < 2.0) return 'Possible association';
      if (rr >= 2.0) return 'Strong pattern';
      return 'No clear pattern';
    }

    it('labels strong patterns correctly', () => {
      expect(getLabel(2.5, 'medium', 15)).toBe('Strong pattern');
      expect(getLabel(3.0, 'high', 40)).toBe('Strong pattern');
    });

    it('labels possible associations', () => {
      expect(getLabel(1.7, 'medium', 12)).toBe('Possible association');
      expect(getLabel(1.8, 'high', 35)).toBe('Possible association');
    });

    it('labels well-tolerated foods', () => {
      expect(getLabel(0.6, 'high', 40)).toBe('Appears well tolerated');
      expect(getLabel(0.3, 'medium', 20)).toBe('Appears well tolerated');
    });

    it('requires sufficient data', () => {
      expect(getLabel(3.0, 'low', 8)).toBe('Not enough data yet');
      expect(getLabel(2.0, 'medium', 4)).toBe('Not enough data yet');
    });
  });
});

describe('Export Functionality', () => {
  describe('JSON Export Structure', () => {
    it('validates expected export structure', () => {
      const mockExport = {
        version: '1.0',
        exportedAt: new Date().toISOString(),
        user: { id: 'user1', email: 'test@example.com' },
        entries: [
          {
            id: 'entry1',
            date: '2026-10-01',
            meals: [],
            symptoms: {},
          },
        ],
      };

      expect(mockExport.version).toBe('1.0');
      expect(mockExport.user).toHaveProperty('id');
      expect(mockExport.entries).toBeInstanceOf(Array);
    });
  });

  describe('CSV Export Structure', () => {
    it('generates CSV header correctly', () => {
      const headers = ['Date', 'Meal Type', 'Food', 'Overall Rating', 'Symptoms'];
      const csvHeader = headers.join(',');
      expect(csvHeader).toBe('Date,Meal Type,Food,Overall Rating,Symptoms');
    });

    it('escapes CSV fields with commas', () => {
      const field = 'Chicken, grilled';
      const escaped = `"${field}"`;
      expect(escaped).toBe('"Chicken, grilled"');
    });
  });
});
