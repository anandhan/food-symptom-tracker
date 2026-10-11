// Food normalization: deterministic rules only. Raw food text is never rewritten.

import { prisma } from '../db';

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

const UNCOUNTABLE = new Set([
  'oats', 'rice', 'milk', 'eggs', 'wheat', 'sugar', 'water', 'coffee', 'tea',
  'chicken', 'turkey', 'quinoa', 'honey', 'soda', 'fiber', 'psyllium',
]);

const STOP_WORDS = new Set([
  'with', 'and', 'the', 'a', 'an', 'of', 'in', 'for', 'to', 'or', '&',
  'homemade', 'style', 'recipe',
]);

/** Synonym / misspelling -> canonical concept. */
export const CONCEPT_ALIASES: Record<string, string> = {
  omlette: 'eggs',
  omelet: 'eggs',
  omelette: 'eggs',
  egg: 'eggs',
  idly: 'rice',
  idli: 'rice',
  idlis: 'rice',
  latte: 'coffee',
  espresso: 'coffee',
  americano: 'coffee',
  cappuccino: 'coffee',
  mocha: 'coffee',
  chai: 'tea',
  granola: 'oats',
  oatmeal: 'oats',
  oat: 'oats',
  dumpling: 'wheat',
  dumplings: 'wheat',
  bread: 'wheat',
  toast: 'wheat',
  bagel: 'wheat',
  pasta: 'wheat',
  pizza: 'wheat',
  flour: 'wheat',
  cracker: 'wheat',
  crackers: 'wheat',
  metamucil: 'psyllium fiber',
  psyllium: 'psyllium fiber',
  cola: 'soda',
  pepsi: 'soda',
  coke: 'soda',
  yoghurt: 'milk',
  yogurt: 'milk',
  cream: 'milk',
  dairy: 'milk',
  cheese: 'milk',
  butter: 'milk',
  peanut: 'peanuts',
  potatoes: 'potato',
};

/** Phrase/token -> several ingredient concepts. */
const COMPOSITE_RULES: Array<{ pattern: RegExp; concepts: string[] }> = [
  { pattern: /\blatte\b/, concepts: ['coffee', 'milk'] },
  { pattern: /\bcappuccino\b/, concepts: ['coffee', 'milk'] },
  { pattern: /\bmocha\b/, concepts: ['coffee', 'milk'] },
  { pattern: /\bmacchiato\b/, concepts: ['coffee', 'milk'] },
  { pattern: /\bflat\s+white\b/, concepts: ['coffee', 'milk'] },
  { pattern: /\bhot chocolate\b|\bcocoa\b/, concepts: ['chocolate', 'milk'] },
  { pattern: /\bcoconut water\b/, concepts: ['coconut'] },
];

const KEYWORD_RULES: Array<{ pattern: RegExp; concept: string }> = [
  { pattern: /\bcoffee\b|\bespresso\b|\bamericano\b/, concept: 'coffee' },
  { pattern: /\bmilk\b|cream|dairy|yogurt|yoghurt|cheese|butter/, concept: 'milk' },
  { pattern: /\bsugar\b/, concept: 'sugar' },
  { pattern: /chicken/, concept: 'chicken' },
  { pattern: /\begg|omelette|omelet|omlette/, concept: 'eggs' },
  { pattern: /potato/, concept: 'potato' },
  { pattern: /\brice\b|idly|idli/, concept: 'rice' },
  { pattern: /\boat|granola/, concept: 'oats' },
  { pattern: /dumpling|wheat|flour|toast|bagel|bread|pasta|pizza|cracker/, concept: 'wheat' },
  { pattern: /metamucil|psyllium|\bfiber\b/, concept: 'psyllium fiber' },
  { pattern: /coconut/, concept: 'coconut' },
  { pattern: /\btea\b|chai/, concept: 'tea' },
  { pattern: /tomato/, concept: 'tomato' },
  { pattern: /peanut/, concept: 'peanuts' },
  { pattern: /\bapple\b/, concept: 'apple' },
  { pattern: /banana/, concept: 'banana' },
  { pattern: /\borange\b/, concept: 'orange' },
  { pattern: /quinoa/, concept: 'quinoa' },
  { pattern: /turkey/, concept: 'turkey' },
  { pattern: /\bsoda\b|\bcola\b/, concept: 'soda' },
  { pattern: /honey/, concept: 'honey' },
  { pattern: /\bchocolate\b/, concept: 'chocolate' },
];

const PORTION_TAIL =
  /,?\s*\d+(\.\d+)?\s*(g|gram|grams|kg|oz|ounce|ounces|ml|l|cup|cups|tsp|tbsp|tablespoons?|teaspoons?|pieces?|bars?|cans?|bottles?|rounded\s+tsp)\b.*$/i;
const PORTION_INLINE =
  /\b\d+(\.\d+)?\s*(g|gram|grams|kg|oz|ounce|ounces|ml|l|cup|cups|tsp|tbsp|pieces?|bars?|cans?|bottles?)\b/gi;
const SIZE_WORD = /\b(small|medium|large|grande|venti|tall|rounded)\b/gi;

export function isDrink(text: string): boolean {
  const lowerText = text.toLowerCase();
  return DRINK_KEYWORDS.some((keyword) => lowerText.includes(keyword));
}

export function singularize(word: string): string {
  const lower = word.toLowerCase();
  if (UNCOUNTABLE.has(lower)) return lower;
  if (lower.endsWith('ies') && lower.length > 4) return `${lower.slice(0, -3)}y`;
  if (lower.endsWith('oes') && lower.length > 4) return lower.slice(0, -2);
  if (lower.endsWith('sses')) return lower.slice(0, -2);
  if (lower.endsWith('s') && !lower.endsWith('ss') && lower.length > 3) return lower.slice(0, -1);
  return lower;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Lowercase/trim, then drop brand prefixes and portion/size tails. Raw text is not modified. */
export function stripBrandAndPortion(foodText: string, brand?: string): string {
  let text = String(foodText || '').toLowerCase().trim();
  if (!text) return '';

  if (brand) {
    const brandNorm = brand.toLowerCase().trim();
    if (brandNorm) {
      text = text.replace(
        new RegExp(`^${escapeRegExp(brandNorm)}\\s*(?:-\\s*)?`, 'i'),
        ''
      );
    }
  }

  const dashParts = text
    .split(/\s+-\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => !/^(small|medium|large|grande|venti|tall)\b/.test(part));

  // "Brand - food name" without a separate brand field: drop the prefix segment.
  text = !brand && dashParts.length > 1 ? dashParts.slice(1).join(' ') : dashParts.join(' ');

  text = text.replace(PORTION_TAIL, ' ');
  text = text.replace(PORTION_INLINE, ' ');
  text = text.replace(SIZE_WORD, ' ');
  text = text.replace(/&/g, ' and ');
  text = text.replace(/[^a-z0-9\s]/g, ' ');
  return text.replace(/\s+/g, ' ').trim();
}

export function fallbackConceptName(cleaned: string): string {
  const words = cleaned
    .split(/\s+/)
    .filter((word) => word && !STOP_WORDS.has(word))
    .map(singularize);
  return words.join(' ').trim();
}

function shouldSkipKeyword(concept: string, cleaned: string): boolean {
  if (concept === 'sugar' && /sugar\s*free/.test(cleaned)) return true;
  if (concept === 'orange' && /metamucil|psyllium/.test(cleaned)) return true;
  if (concept === 'water' && /coconut/.test(cleaned)) return true;
  return false;
}

/** Canonical ingredient names inferred from a food line. Does not change raw text. */
export function inferConceptNames(foodText: string, brand?: string): string[] {
  const cleaned = stripBrandAndPortion(foodText, brand);
  if (!cleaned) {
    const fallback = fallbackConceptName(String(foodText || '').toLowerCase().trim());
    return fallback ? [fallback] : [];
  }

  const names = new Set<string>();

  for (const rule of COMPOSITE_RULES) {
    if (rule.pattern.test(cleaned)) {
      rule.concepts.forEach((concept) => names.add(concept));
    }
  }

  for (const token of cleaned.split(/\s+/)) {
    const aliased = CONCEPT_ALIASES[token] || CONCEPT_ALIASES[singularize(token)];
    if (aliased) names.add(aliased);
  }

  for (const rule of KEYWORD_RULES) {
    if (rule.pattern.test(cleaned) && !shouldSkipKeyword(rule.concept, cleaned)) {
      names.add(rule.concept);
    }
  }

  if (/\bwater\b/.test(cleaned) && !/coconut/.test(cleaned)) {
    names.add('water');
  }

  if (names.size > 0) return [...names];

  const unmatched = fallbackConceptName(cleaned);
  return unmatched ? [unmatched] : [];
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

export async function normalizeFoodItem(
  foodText: string,
  brand?: string
): Promise<NormalizationResult> {
  const names = inferConceptNames(foodText, brand);
  const concepts = await upsertConceptsByName(names.map((name) => ({ name, confidence: 0.85 })));
  return { concepts };
}

export async function linkFoodItemsBatch(
  items: Array<{ id: string; rawText: string; brand?: string | null }>
): Promise<{ items: number; links: number }> {
  if (items.length === 0) return { items: 0, links: 0 };

  const perItem = items.map((item) => ({
    id: item.id,
    names: inferConceptNames(item.rawText, item.brand || undefined),
  }));

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
        assignedBy: 'rules' as const,
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
  foodItemIds: string[]
): Promise<{ items: number; links: number }> {
  if (foodItemIds.length === 0) return { items: 0, links: 0 };
  const items = await prisma.foodItem.findMany({
    where: { id: { in: foodItemIds } },
    select: { id: true, rawText: true, brand: true },
  });
  return linkFoodItemsBatch(items);
}

export async function linkFoodItemConcepts(
  foodItemId: string,
  foodText: string,
  brand?: string | null
): Promise<NormalizationResult> {
  const result = await normalizeFoodItem(foodText, brand || undefined);
  if (result.concepts.length > 0) {
    await prisma.foodItemConcept.createMany({
      data: result.concepts.map((concept) => ({
        foodItemId,
        foodConceptId: concept.conceptId,
        confidence: concept.confidence,
        assignedBy: 'rules',
      })),
      skipDuplicates: true,
    });
  }
  return result;
}

export async function linkUnlinkedFoodItemConcepts(
  options?: { limit?: number }
): Promise<{ items: number; links: number }> {
  const items = await prisma.foodItem.findMany({
    where: { foodItemConcepts: { none: {} } },
    select: { id: true, rawText: true, brand: true },
    take: options?.limit ?? 200,
  });
  return linkFoodItemsBatch(items);
}

export async function backfillAllFoodItemConcepts(): Promise<{ items: number; links: number }> {
  const items = await prisma.foodItem.findMany({
    select: { id: true, rawText: true, brand: true },
  });
  return linkFoodItemsBatch(items);
}
