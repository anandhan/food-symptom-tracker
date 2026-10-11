export interface FoodEntry {
  text: string;
  brand?: string;
  food_name?: string;
  quantity?: string;
  is_drink?: boolean;
  calories?: number;
  carbs?: number;
  fat?: number;
  protein?: number;
  fiber?: number;
  sugar?: number;
  needs_review?: boolean;
  ocr_confidence?: number;
}

export interface ExtractionResult {
  breakfast: FoodEntry[];
  lunch: FoodEntry[];
  dinner: FoodEntry[];
  snacks: FoodEntry[];
  drinks: FoodEntry[];
  raw_ocr_text: string;
  confidence: number;
  extracted_date?: string;
  model?: string;
}

export type MealSlot = 'breakfast' | 'lunch' | 'dinner' | 'snacks' | 'drinks';

export interface OcrWord {
  text: string;
  confidence: number;
}

export interface OcrLine {
  text: string;
  confidence: number;
  words?: OcrWord[];
}

export const LOW_OCR_CONFIDENCE = 60;

export function emptyExtraction(raw = '', confidence = 0): ExtractionResult {
  return {
    breakfast: [],
    lunch: [],
    dinner: [],
    snacks: [],
    drinks: [],
    raw_ocr_text: raw,
    confidence,
  };
}
