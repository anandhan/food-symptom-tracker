import { isDrink } from '@/lib/ai/food-normalization';
import {
  LOW_OCR_CONFIDENCE,
  emptyExtraction,
  type ExtractionResult,
  type FoodEntry,
  type MealSlot,
  type OcrLine,
} from './types';

const MEAL_ALIASES: Record<string, MealSlot> = {
  breakfast: 'breakfast',
  breaktast: 'breakfast',
  breaklast: 'breakfast',
  lunch: 'lunch',
  lunchh: 'lunch',
  dinner: 'dinner',
  dinnern: 'dinner',
  snack: 'snacks',
  snacks: 'snacks',
  snackk: 'snacks',
  drink: 'drinks',
  drinks: 'drinks',
};

const MONTHS: Record<string, number> = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
};

const SKIP_LINE = [
  /^add\s*food\b/i,
  /^quick\s*tools?\b/i,
  /add\s*food\s*[|/\\]\s*quick/i,
  /^totals?\b/i,
  /^total\s/i,
  /^your\s*daily\s*goal/i,
  /^remaining\b/i,
  /you.?ve\s*earned/i,
  /extra\s*calories?\s*from\s*exercise/i,
  /^quick\s*add\b/i,
  /^kcal\b/i,
  /^(?:g|mg|oz|ml|kcal)(?:\s+(?:g|mg|oz|ml|kcal))+$/i,
];

const SERVING_UNITS =
  'g|grams?|kg|oz|ounces?|ml|l|cups?|tsp|tbsp|tablespoons?|teaspoons?|pieces?|bars?|cans?|bottles?|rounded\\s+tsp';

const SERVING_TAIL = new RegExp(
  `,\\s*(\\d+(?:[.,]\\d+)?\\s*(?:rounded\\s+)?(?:${SERVING_UNITS})\\b.*)$`,
  'i'
);
const SERVING_END = new RegExp(
  `\\s+(\\d+(?:[.,]\\d+)?\\s*(?:rounded\\s+)?(?:${SERVING_UNITS})\\b.*)$`,
  'i'
);

const SERVING_LINE = new RegExp(
  `^\\d+(?:[.,]\\d+)?\\s*(?:rounded\\s+)?(?:${SERVING_UNITS})\\b`,
  'i'
);

const SIZE_WORD = /^(small|medium|large|grande|venti|tall)$/i;

export function toOcrLines(input: string | OcrLine[]): OcrLine[] {
  if (Array.isArray(input)) {
    return input
      .map((line) => ({
        text: String(line.text ?? ''),
        confidence: Number.isFinite(line.confidence) ? line.confidence : 100,
        words: line.words,
      }))
      .filter((line) => line.text.trim().length > 0);
  }
  return String(input || '')
    .split(/\r?\n/)
    .map((text) => ({ text, confidence: 100 }))
    .filter((line) => line.text.trim().length > 0);
}

/** Fix O/0 and l/1 only in numeric contexts; strip bullets. Does not rewrite food words. */
export function softenOcrNoise(text: string): string {
  return String(text || '')
    .replace(/[•●○◦▪▸►·]/g, ' ')
    .replace(/[–—−]/g, '-')
    .replace(/\|/g, ' ')
    .replace(/(\d)O/g, '$10')
    .replace(/O(\d)/g, '0$1')
    .replace(/(\d)l\b/g, '$11')
    .replace(/\bl(\d)/g, '1$1')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseDiaryDate(text: string): string | undefined {
  const cleaned = softenOcrNoise(text).replace(/([a-z])([A-Z])/g, '$1 $2');
  const iso = cleaned.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
  if (iso) {
    return `${iso[1]}-${iso[2].padStart(2, '0')}-${iso[3].padStart(2, '0')}`;
  }

  const named = cleaned.match(
    /\b(?:mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?)?,?\s*(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(20\d{2})\b/i
  );
  if (named) {
    const month = MONTHS[named[1].toLowerCase()];
    const day = Number(named[2]);
    const year = Number(named[3]);
    if (month && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  const dayFirst = cleaned.match(
    /\b(\d{1,2})(?:st|nd|rd|th)?\s+(january|february|march|april|may|june|july|august|september|october|november|december)\s+(20\d{2})\b/i
  );
  if (dayFirst) {
    const month = MONTHS[dayFirst[2].toLowerCase()];
    const day = Number(dayFirst[1]);
    const year = Number(dayFirst[3]);
    if (month && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  return undefined;
}

function normalizeHeaderKey(line: string): string {
  return softenOcrNoise(line)
    .toLowerCase()
    .replace(/[^a-z]/g, '');
}

export function detectMealHeader(line: string): MealSlot | null {
  const key = normalizeHeaderKey(line);
  if (!key || key.length > 12) return null;
  return MEAL_ALIASES[key] || null;
}

function isColumnHeader(line: string): boolean {
  const n = softenOcrNoise(line).toLowerCase();
  if (!n) return false;
  const hasCal = /calories|kcal/.test(n);
  const macroHits = ['carb', 'fat', 'protein', 'fiber', 'sugar'].filter((k) => n.includes(k)).length;
  if (hasCal && macroHits >= 2) return true;
  if (macroHits >= 3 && n.length < 80) return true;
  return false;
}

function isSkipRow(line: string): boolean {
  const n = softenOcrNoise(line);
  if (!n) return true;
  if (isColumnHeader(n)) return true;
  if (detectMealHeader(n)) return true;
  if (/your\s*food\s*diary/i.test(n)) return true;
  return SKIP_LINE.some((re) => re.test(n));
}

function isOnlyNumbers(line: string): boolean {
  return /^[\d\s.,|/\\+-]+$/.test(softenOcrNoise(line));
}

function parseNumberToken(raw: string): number | undefined {
  const n = Number(String(raw).replace(',', '.'));
  return Number.isFinite(n) ? n : undefined;
}

function splitTrailingMacros(line: string): { head: string; numbers: number[] } {
  const trimmed = line.trim();
  const tokens = trimmed.split(/\s+/);
  const numbers: number[] = [];
  let cut = tokens.length;

  for (let i = tokens.length - 1; i >= 0; i -= 1) {
    const raw = tokens[i].replace(/[)\]]+$/g, '').replace(/^[[(]+/g, '');
    if (!raw || /^kcal$/i.test(raw) || raw === '-' || raw === '[-') {
      cut = i;
      continue;
    }
    if (/^[-+]?\d+(?:[.,]\d+)?$/.test(raw)) {
      const n = parseNumberToken(raw);
      if (n === undefined) break;
      numbers.unshift(n);
      cut = i;
      continue;
    }
    break;
  }

  const head = tokens.slice(0, cut).join(' ').trim();
  if (numbers.length >= 4 && /[a-zA-Z]/.test(head)) {
    return { head, numbers };
  }
  if (
    numbers.length === 1 &&
    /(?:g|gram|oz|ml|cup|tsp|tbsp|piece|can|bottle)\b/i.test(head)
  ) {
    return { head, numbers };
  }
  return { head: trimmed, numbers: [] };
}

function looksLikeServingLine(line: string): boolean {
  const n = softenOcrNoise(line);
  if (SERVING_LINE.test(n)) return true;
  if (/^\d+(?:[.,]\d+)?\s*(?:,\s*)?\d+\s*$/.test(n) && n.length < 24) return true;
  return false;
}

function hasServingOrMacros(line: string): boolean {
  const { numbers } = splitTrailingMacros(softenOcrNoise(line));
  if (numbers.length >= 4) return true;
  return SERVING_TAIL.test(softenOcrNoise(line)) || SERVING_LINE.test(softenOcrNoise(line));
}

function looksLikeFoodName(line: string): boolean {
  const n = softenOcrNoise(line);
  if (!n || isSkipRow(n) || isOnlyNumbers(n) || looksLikeServingLine(n)) return false;
  return /[a-zA-Z]/.test(n);
}

export function mergeWrappedLines(lines: OcrLine[]): OcrLine[] {
  const out: OcrLine[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const current = lines[i];
    const text = current.text.trim();
    if (!text) continue;
    const next = lines[i + 1];
    if (next && looksLikeFoodName(text) && !hasServingOrMacros(text)) {
      const nextText = next.text.trim();
      const nextIsNewRow = / - /.test(nextText) && hasServingOrMacros(nextText);
      const continues =
        !nextIsNewRow &&
        (looksLikeServingLine(nextText) ||
          /^[a-z&,]/.test(nextText) ||
          hasServingOrMacros(nextText) ||
          (looksLikeFoodName(nextText) && !detectMealHeader(nextText)));
      if (continues) {
        out.push({
          text: `${text} ${nextText}`.replace(/\s+/g, ' '),
          confidence: Math.min(current.confidence, next.confidence),
          words: [...(current.words || []), ...(next.words || [])],
        });
        i += 1;
        continue;
      }
    }
    out.push(current);
  }
  return out;
}

function parseFoodHead(head: string): Pick<FoodEntry, 'brand' | 'food_name' | 'quantity'> {
  const cleaned = softenOcrNoise(head);
  let quantity: string | undefined;
  let namePart = cleaned;

  const serving = namePart.match(SERVING_TAIL) || namePart.match(SERVING_END);
  if (serving && serving.index !== undefined) {
    quantity = serving[1].trim().replace(/,+\s*$/, '');
    namePart = namePart.slice(0, serving.index).trim();
  }

  const sizeDash = namePart.match(/\s*-\s*(small|medium|large|grande|venti|tall)\s*$/i);
  if (sizeDash && sizeDash.index !== undefined) {
    const size = sizeDash[1];
    quantity = quantity ? `${size}, ${quantity}` : size;
    namePart = namePart.slice(0, sizeDash.index).trim();
  }

  const dash = namePart.indexOf(' - ');
  if (dash > 0) {
    return {
      brand: namePart.slice(0, dash).trim(),
      food_name: namePart.slice(dash + 3).trim(),
      quantity,
    };
  }
  return { food_name: namePart, quantity };
}

function lineConfidence(line: OcrLine): number {
  if (line.words && line.words.length > 0) {
    const sum = line.words.reduce((acc, word) => acc + (word.confidence || 0), 0);
    return sum / line.words.length;
  }
  return line.confidence;
}

function toFoodEntry(line: OcrLine): FoodEntry | null {
  const raw = line.text.trim();
  if (!raw || isSkipRow(raw) || isOnlyNumbers(raw)) return null;

  const softened = softenOcrNoise(raw);
  const { head, numbers } = splitTrailingMacros(softened);
  if (!looksLikeFoodName(head) && !hasServingOrMacros(head)) return null;

  const parsed = parseFoodHead(head);
  if (!parsed.food_name && !parsed.brand) return null;

  const calories = numbers.length > 0 ? numbers[0] : undefined;
  const carbs = numbers.length >= 6 ? numbers[1] : undefined;
  const fat = numbers.length >= 6 ? numbers[2] : undefined;
  const protein = numbers.length >= 6 ? numbers[3] : undefined;
  const fiber = numbers.length >= 6 ? numbers[4] : undefined;
  const sugar = numbers.length >= 6 ? numbers[5] : undefined;

  // Two-token "serving, calories" already folded into head; a single leftover number is calories.
  const confidence = lineConfidence(line);
  const displayName = parsed.food_name || parsed.brand || raw;
  const entry: FoodEntry = {
    text: raw,
    brand: parsed.brand,
    food_name: parsed.food_name || displayName,
    quantity: parsed.quantity,
    is_drink: isDrink(`${parsed.brand || ''} ${parsed.food_name || ''} ${raw}`),
    calories,
    carbs,
    fat,
    protein,
    fiber,
    sugar,
    ocr_confidence: confidence,
    needs_review: confidence < LOW_OCR_CONFIDENCE,
  };
  return entry;
}

function applyServingLine(item: FoodEntry, servingLine: string): void {
  const softened = softenOcrNoise(servingLine);
  const { head, numbers } = splitTrailingMacros(softened);
  const serving = head.match(
    new RegExp(`^(\\d+(?:[.,]\\d+)?\\s*(?:rounded\\s+)?(?:${SERVING_UNITS})\\b.*)$`, 'i')
  );
  if (serving && !item.quantity) {
    item.quantity = serving[1].replace(/,+\s*$/, '').trim();
  }
  if (numbers.length > 0 && item.calories == null) {
    item.calories = numbers[0];
  }
  if (numbers.length >= 6) {
    item.carbs = numbers[1];
    item.fat = numbers[2];
    item.protein = numbers[3];
    item.fiber = numbers[4];
    item.sugar = numbers[5];
  }
  item.text = `${item.text} ${servingLine.trim()}`.replace(/\s+/g, ' ');
}

/**
 * Deterministic MyFitnessPal diary parser. `text` on each item is the original OCR line(s).
 */
export function parseMfpDiary(input: string | OcrLine[]): ExtractionResult {
  const originalLines = toOcrLines(input);
  const raw_ocr_text = Array.isArray(input)
    ? originalLines.map((line) => line.text).join('\n')
    : String(input || '');

  if (originalLines.length === 0) {
    return emptyExtraction(raw_ocr_text, 0);
  }

  const lines = mergeWrappedLines(originalLines);
  const extracted_date = parseDiaryDate(raw_ocr_text);
  const result = emptyExtraction(raw_ocr_text, 0);
  result.extracted_date = extracted_date;
  result.model = 'tesseract-mfp-parser';

  let current: MealSlot = 'breakfast';
  const confidences: number[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const text = line.text.trim();
    const meal = detectMealHeader(text);
    if (meal) {
      current = meal;
      continue;
    }
    if (isSkipRow(text) || isOnlyNumbers(text)) continue;

    if (looksLikeServingLine(text)) {
      const bucket = result[current];
      const last = bucket[bucket.length - 1];
      if (last) applyServingLine(last, text);
      continue;
    }

    const entry = toFoodEntry(line);
    if (!entry) continue;
    result[current].push(entry);
    if (typeof entry.ocr_confidence === 'number') confidences.push(entry.ocr_confidence);
  }

  result.confidence =
    confidences.length > 0
      ? confidences.reduce((a, b) => a + b, 0) / confidences.length / 100
      : 0.5;

  return result;
}

export function allParsedItems(result: ExtractionResult): Array<FoodEntry & { meal: MealSlot }> {
  const slots: MealSlot[] = ['breakfast', 'lunch', 'dinner', 'snacks', 'drinks'];
  return slots.flatMap((meal) => result[meal].map((item) => ({ ...item, meal })));
}
