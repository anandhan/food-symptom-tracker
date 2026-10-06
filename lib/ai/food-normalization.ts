// Food normalization: rule-based concepts, persisted to FoodConcept, optional Gemini

import { prisma } from '../db';
import { GoogleGenerativeAI } from '@google/generative-ai';

export interface NormalizationResult {
  concepts: Array<{
    conceptId: string;
    conceptName: string;
    confidence: number;
  }>;
}

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

export function isDrink(text: string): boolean {
  const lowerText = text.toLowerCase();
  return DRINK_KEYWORDS.some((keyword) => lowerText.includes(keyword));
}

/** Canonical names inferred from a food line (no DB). */
export function inferConceptNames(foodText: string, brand?: string): string[] {
  const lower = `${brand || ''} ${foodText}`.toLowerCase();
  const names = new Set<string>();

  if (/coffee|latte|espresso|cappuccino|mocha|americano/.test(lower)) names.add('coffee');
  if (/\bmilk\b|latte|cream|dairy|yogurt|cheese|butter/.test(lower)) names.add('milk');
  if (/sugar/.test(lower) && !/sugar\s*free/.test(lower)) names.add('sugar');
  if (/chicken/.test(lower)) names.add('chicken');
  if (/egg|omelette|omelet|omlette/.test(lower)) names.add('eggs');
  if (/potato/.test(lower)) names.add('potato');
  if (/rice|idly|idli/.test(lower)) names.add('rice');
  if (/oat|granola/.test(lower)) names.add('oats');
  if (/dumpling|wheat|flour|toast|bagel|bread|pasta|pizza|cracker/.test(lower)) names.add('wheat');
  if (/metamucil|psyllium|fiber/.test(lower)) names.add('psyllium fiber');
  if (/coconut/.test(lower)) names.add('coconut');
  if (/\btea\b|chai/.test(lower)) names.add('tea');
  if (/tomato/.test(lower)) names.add('tomato');
  if (/water/.test(lower) && !/coconut/.test(lower)) names.add('water');
  if (/peanut/.test(lower)) names.add('peanuts');
  if (/apple/.test(lower)) names.add('apple');
  if (/banana/.test(lower)) names.add('banana');
  if (/orange/.test(lower) && !/metamucil/.test(lower)) names.add('orange');
  if (/quinoa/.test(lower)) names.add('quinoa');
  if (/turkey/.test(lower)) names.add('turkey');
  if (/soda|cola/.test(lower)) names.add('soda');
  if (/honey/.test(lower)) names.add('honey');

  return [...names];
}

export async function upsertConceptsByName(
  names: Array<{ name: string; confidence?: number }>
): Promise<NormalizationResult['concepts']> {
  const concepts = [];
  for (const { name, confidence } of names) {
    const canonical = name.trim().toLowerCase();
    if (!canonical) continue;
    const concept = await prisma.foodConcept.upsert({
      where: { name: canonical },
      update: {},
      create: {
        name: canonical,
        aliases: JSON.stringify([canonical]),
        isActive: true,
      },
    });
    const resolved = concept.mergedIntoId
      ? await prisma.foodConcept.findUnique({ where: { id: concept.mergedIntoId } })
      : concept;
    const target = resolved && resolved.isActive ? resolved : concept;
    concepts.push({
      conceptId: target.id,
      conceptName: target.name,
      confidence: confidence ?? 0.85,
    });
  }
  return concepts;
}

async function geminiConceptNames(foodText: string, brand?: string): Promise<string[]> {
  if (!process.env.GEMINI_API_KEY || process.env.VISION_PROVIDER === 'mock') {
    return [];
  }
  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({
      model: process.env.GEMINI_EXTRACTION_MODEL || 'gemini-2.5-flash',
      generationConfig: { responseMimeType: 'application/json' },
    });
    const result = await model.generateContent(
      `Normalize this food into core ingredient concepts (not brands).
Food: ${foodText}
${brand ? `Brand: ${brand}` : ''}
Examples: "Dunkin' Donuts - Latte With Sugar" -> coffee, milk, sugar.
Return JSON: {"concepts":[{"name":"coffee","confidence":0.95}]}`
    );
    const parsed = JSON.parse(result.response.text());
    return (parsed.concepts || []).map((c: { name: string }) => String(c.name).toLowerCase());
  } catch (error) {
    console.error('Gemini concept extraction failed:', error);
    return [];
  }
}

export async function normalizeFoodItem(
  foodText: string,
  brand?: string
): Promise<NormalizationResult> {
  const fromRules = inferConceptNames(foodText, brand);
  const fromGemini = await geminiConceptNames(foodText, brand);
  const merged = [...new Set([...fromRules, ...fromGemini])];
  const names = (merged.length > 0 ? merged : [foodText.split(',')[0].trim().toLowerCase()]).filter(Boolean);
  const concepts = await upsertConceptsByName(names.map((name) => ({ name, confidence: 0.85 })));
  return { concepts };
}

export async function linkFoodItemConcepts(
  foodItemId: string,
  foodText: string,
  brand?: string | null
): Promise<NormalizationResult> {
  const result = await normalizeFoodItem(foodText, brand || undefined);
  for (const concept of result.concepts) {
    await prisma.foodItemConcept.upsert({
      where: {
        foodItemId_foodConceptId: {
          foodItemId,
          foodConceptId: concept.conceptId,
        },
      },
      update: { confidence: concept.confidence },
      create: {
        foodItemId,
        foodConceptId: concept.conceptId,
        confidence: concept.confidence,
        assignedBy: 'ai',
      },
    });
  }
  return result;
}

export async function backfillAllFoodItemConcepts(): Promise<{ items: number; links: number }> {
  const items = await prisma.foodItem.findMany({
    select: { id: true, rawText: true, brand: true },
  });
  let links = 0;
  for (const item of items) {
    const result = await linkFoodItemConcepts(item.id, item.rawText, item.brand);
    links += result.concepts.length;
  }
  return { items: items.length, links };
}
