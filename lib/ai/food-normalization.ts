// Food normalization: rule-based concepts, persisted to FoodConcept, optional Gemini

import { prisma } from '../db';
import { generateContentWithFallback, resolveGeminiModel } from '@/lib/ai/gemini-model';

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
  const requested = names
    .map(({ name, confidence }) => ({
      name: name.trim().toLowerCase(),
      confidence: confidence ?? 0.85,
    }))
    .filter((row) => row.name);
  if (requested.length === 0) return [];

  const uniqueNames = [...new Set(requested.map((row) => row.name))];
  const existing = await prisma.foodConcept.findMany({
    where: { name: { in: uniqueNames } },
  });
  const have = new Set(existing.map((row) => row.name));
  const missing = uniqueNames.filter((name) => !have.has(name));
  if (missing.length > 0) {
    await prisma.foodConcept.createMany({
      data: missing.map((name) => ({
        name,
        aliases: JSON.stringify([name]),
        isActive: true,
      })),
      skipDuplicates: true,
    });
  }

  const all = await prisma.foodConcept.findMany({
    where: { name: { in: uniqueNames } },
  });
  const mergeIds = [...new Set(all.map((row) => row.mergedIntoId).filter(Boolean))] as string[];
  const merged = mergeIds.length
    ? await prisma.foodConcept.findMany({ where: { id: { in: mergeIds } } })
    : [];
  const byId = new Map([...all, ...merged].map((row) => [row.id, row]));

  const byName = new Map<string, NormalizationResult['concepts'][number]>();
  for (const concept of all) {
    const resolved = concept.mergedIntoId ? byId.get(concept.mergedIntoId) : concept;
    const target = resolved && resolved.isActive ? resolved : concept;
    byName.set(concept.name, {
      conceptId: target.id,
      conceptName: target.name,
      confidence: 0.85,
    });
  }

  return requested
    .map((row) => {
      const concept = byName.get(row.name);
      return concept ? { ...concept, confidence: row.confidence } : null;
    })
    .filter((row): row is NormalizationResult['concepts'][number] => Boolean(row));
}

async function geminiConceptNames(foodText: string, brand?: string): Promise<string[]> {
  if (!process.env.GEMINI_API_KEY || process.env.VISION_PROVIDER === 'mock') {
    return [];
  }
  try {
    const { text } = await generateContentWithFallback({
      apiKey: process.env.GEMINI_API_KEY,
      model: resolveGeminiModel(process.env.GEMINI_EXTRACTION_MODEL),
      contents: `Normalize this food into core ingredient concepts (not brands).
Food: ${foodText}
${brand ? `Brand: ${brand}` : ''}
Examples: "Dunkin' Donuts - Latte With Sugar" -> coffee, milk, sugar.
Return JSON: {"concepts":[{"name":"coffee","confidence":0.95}]}`,
      config: { responseMimeType: 'application/json' },
    });
    const parsed = JSON.parse(text);
    return (parsed.concepts || []).map((c: { name: string }) => String(c.name).toLowerCase());
  } catch (error) {
    console.error('Gemini concept extraction failed:', error);
    return [];
  }
}

export type NormalizeOptions = {
  /** Gemini is opt-in for background/cron work. Save persist never sets this. */
  useGemini?: boolean;
};

function conceptNamesForItem(foodText: string, brand?: string): string[] {
  const fromRules = inferConceptNames(foodText, brand);
  const fallback = foodText.split(',')[0].trim().toLowerCase();
  const names = fromRules.length > 0 ? fromRules : fallback ? [fallback] : [];
  return [...new Set(names)];
}

export async function normalizeFoodItem(
  foodText: string,
  brand?: string,
  options?: NormalizeOptions
): Promise<NormalizationResult> {
  const fromRules = inferConceptNames(foodText, brand);
  const fromGemini = options?.useGemini === false ? [] : await geminiConceptNames(foodText, brand);
  const merged = [...new Set([...fromRules, ...fromGemini])];
  const names = (merged.length > 0 ? merged : [foodText.split(',')[0].trim().toLowerCase()]).filter(Boolean);
  const concepts = await upsertConceptsByName(names.map((name) => ({ name, confidence: 0.85 })));
  return { concepts };
}

export async function linkFoodItemsBatch(
  items: Array<{ id: string; rawText: string; brand?: string | null }>,
  options?: NormalizeOptions
): Promise<{ items: number; links: number }> {
  if (items.length === 0) return { items: 0, links: 0 };

  const perItem: Array<{ id: string; names: string[] }> = [];
  for (const item of items) {
    let names = conceptNamesForItem(item.rawText, item.brand || undefined);
    if (options?.useGemini) {
      const fromGemini = await geminiConceptNames(item.rawText, item.brand || undefined);
      names = [...new Set([...names, ...fromGemini])];
    }
    perItem.push({ id: item.id, names });
  }

  const uniqueNames = [...new Set(perItem.flatMap((row) => row.names))];
  const concepts = await upsertConceptsByName(uniqueNames.map((name) => ({ name })));
  const byName = new Map(
    uniqueNames
      .map((name, index) => [name, concepts[index]] as const)
      .filter((row): row is readonly [string, (typeof concepts)[number]] => Boolean(row[1]))
  );

  const links = [];
  for (const item of perItem) {
    for (const name of item.names) {
      const concept = byName.get(name);
      if (!concept) continue;
      links.push({
        foodItemId: item.id,
        foodConceptId: concept.conceptId,
        confidence: concept.confidence,
        assignedBy: 'ai' as const,
      });
    }
  }

  if (links.length > 0) {
    await prisma.foodItemConcept.createMany({
      data: links,
      skipDuplicates: true,
    });
  }

  return { items: items.length, links: links.length };
}

export async function linkFoodItemsByIds(
  foodItemIds: string[],
  options?: NormalizeOptions
): Promise<{ items: number; links: number }> {
  if (foodItemIds.length === 0) return { items: 0, links: 0 };
  const items = await prisma.foodItem.findMany({
    where: { id: { in: foodItemIds } },
    select: { id: true, rawText: true, brand: true },
  });
  return linkFoodItemsBatch(items, options);
}

export async function linkFoodItemConcepts(
  foodItemId: string,
  foodText: string,
  brand?: string | null,
  options?: NormalizeOptions
): Promise<NormalizationResult> {
  const result = await normalizeFoodItem(foodText, brand || undefined, options);
  if (result.concepts.length > 0) {
    await prisma.foodItemConcept.createMany({
      data: result.concepts.map((concept) => ({
        foodItemId,
        foodConceptId: concept.conceptId,
        confidence: concept.confidence,
        assignedBy: 'ai',
      })),
      skipDuplicates: true,
    });
  }
  return result;
}

export async function linkUnlinkedFoodItemConcepts(
  options?: NormalizeOptions & { limit?: number }
): Promise<{ items: number; links: number }> {
  const items = await prisma.foodItem.findMany({
    where: { foodItemConcepts: { none: {} } },
    select: { id: true, rawText: true, brand: true },
    take: options?.limit ?? 200,
  });
  return linkFoodItemsBatch(items, { useGemini: options?.useGemini === true });
}

export async function backfillAllFoodItemConcepts(
  options?: NormalizeOptions
): Promise<{ items: number; links: number }> {
  const items = await prisma.foodItem.findMany({
    select: { id: true, rawText: true, brand: true },
  });
  return linkFoodItemsBatch(items, options);
}
