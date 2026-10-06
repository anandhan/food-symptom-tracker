// Food normalization service - maps food items to canonical concepts

import { prisma } from '@/lib/db';
import { GoogleGenerativeAI } from '@google/generative-ai';

export interface NormalizationResult {
  concepts: Array<{
    conceptId: string;
    conceptName: string;
    confidence: number;
  }>;
}

// Common drink keywords for detection
const DRINK_KEYWORDS = [
  'coffee', 'latte', 'espresso', 'cappuccino', 'mocha', 'americano',
  'tea', 'chai', 'matcha',
  'water', 'sparkling water', 'coconut water',
  'juice', 'smoothie', 'shake',
  'soda', 'cola', 'pepsi', 'sprite', 'fanta',
  'milk', 'almond milk', 'oat milk', 'soy milk',
  'beer', 'wine', 'alcohol',
  'energy drink', 'gatorade', 'sports drink',
  'hot chocolate', 'cocoa',
];

// Detect if a food item is a drink
export function isDrink(text: string): boolean {
  const lowerText = text.toLowerCase();
  return DRINK_KEYWORDS.some(keyword => lowerText.includes(keyword));
}

// Normalize a food item to canonical concepts using AI + rules
export async function normalizeFoodItem(
  foodText: string,
  brand?: string
): Promise<NormalizationResult> {
  try {
    // Check if we should use AI or mock
    if (!process.env.GEMINI_API_KEY || process.env.VISION_PROVIDER === 'mock') {
      return mockNormalization(foodText, brand);
    }

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({
      model: process.env.GEMINI_EXTRACTION_MODEL || 'gemini-2.5-flash',
      generationConfig: {
        responseMimeType: 'application/json',
      },
    });

    const prompt = buildNormalizationPrompt(foodText, brand);
    const result = await model.generateContent(prompt);
    const response = JSON.parse(result.response.text());

    // Find or create concepts in database
    const concepts = await Promise.all(
      response.concepts.map(async (c: { name: string; confidence: number }) => {
        const concept = await prisma.foodConcept.upsert({
          where: { name: c.name.toLowerCase() },
          update: {},
          create: {
            name: c.name.toLowerCase(),
            aliases: [c.name.toLowerCase()],
          },
        });
        return {
          conceptId: concept.id,
          conceptName: concept.name,
          confidence: c.confidence,
        };
      })
    );

    return { concepts };
  } catch (error) {
    console.error('Food normalization failed:', error);
    // Fallback to mock normalization
    return mockNormalization(foodText, brand);
  }
}

function buildNormalizationPrompt(foodText: string, brand?: string): string {
  return `Normalize this food item into its core ingredient concepts.

Food: ${foodText}
${brand ? `Brand: ${brand}` : ''}

Break down into basic ingredients/concepts. For example:
- "Dunkin' Donuts - Latte With Sugar" -> coffee, milk, sugar
- "Starbucks - Espresso & Cream Beverage" -> coffee, cream, sugar
- "Wellwish - Chicken Dumplings" -> chicken, wheat flour
- "Metamucil Sugar Free Orange" -> psyllium fiber, artificial sweetener
- "Nature Valley - Oats & Honey Granola" -> oats, honey, nuts
- "Homemade - Omelette" -> eggs, possibly cheese, vegetables
- "Idly" -> rice, lentils
- "Potato wedge" -> potato, oil

Return canonical ingredient names, not brand names. Be specific but not overly detailed.

Return JSON:
{
  "concepts": [
    {"name": "coffee", "confidence": 0.95},
    {"name": "milk", "confidence": 0.9},
    {"name": "sugar", "confidence": 0.85}
  ]
}`;
}

// Mock normalization using rule-based logic
function mockNormalization(foodText: string, brand?: string): NormalizationResult {
  const lower = foodText.toLowerCase();
  const concepts: Array<{ conceptId: string; conceptName: string; confidence: number }> = [];

  // Simple rule-based normalization
  if (lower.includes('coffee') || lower.includes('latte') || lower.includes('espresso')) {
    concepts.push({ conceptId: 'mock-coffee', conceptName: 'coffee', confidence: 0.9 });
  }
  if (lower.includes('milk') || lower.includes('latte') || lower.includes('cream')) {
    concepts.push({ conceptId: 'mock-dairy', conceptName: 'dairy', confidence: 0.8 });
  }
  if (lower.includes('sugar') && !lower.includes('sugar free')) {
    concepts.push({ conceptId: 'mock-sugar', conceptName: 'sugar', confidence: 0.9 });
  }
  if (lower.includes('chicken')) {
    concepts.push({ conceptId: 'mock-chicken', conceptName: 'chicken', confidence: 0.95 });
  }
  if (lower.includes('egg') || lower.includes('omelette') || lower.includes('omelet')) {
    concepts.push({ conceptId: 'mock-eggs', conceptName: 'eggs', confidence: 0.95 });
  }
  if (lower.includes('potato')) {
    concepts.push({ conceptId: 'mock-potato', conceptName: 'potato', confidence: 0.95 });
  }
  if (lower.includes('rice') || lower.includes('idly') || lower.includes('idli')) {
    concepts.push({ conceptId: 'mock-rice', conceptName: 'rice', confidence: 0.9 });
  }
  if (lower.includes('oat') || lower.includes('granola')) {
    concepts.push({ conceptId: 'mock-oats', conceptName: 'oats', confidence: 0.9 });
  }
  if (lower.includes('dumpling')) {
    concepts.push({ conceptId: 'mock-wheat', conceptName: 'wheat', confidence: 0.8 });
  }
  if (lower.includes('metamucil') || lower.includes('fiber')) {
    concepts.push({ conceptId: 'mock-fiber', conceptName: 'psyllium fiber', confidence: 0.9 });
  }
  if (lower.includes('coconut water')) {
    concepts.push({ conceptId: 'mock-coconut', conceptName: 'coconut', confidence: 0.95 });
  }

  // If no concepts found, use the food name itself as a concept
  if (concepts.length === 0) {
    concepts.push({
      conceptId: 'mock-unknown',
      conceptName: foodText.split(',')[0].trim().toLowerCase(),
      confidence: 0.5,
    });
  }

  return { concepts };
}
