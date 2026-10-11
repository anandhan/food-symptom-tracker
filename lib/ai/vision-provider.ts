// Extraction types and the fixture helper. Gemini is not used for extraction.

export type { ExtractionResult, FoodEntry } from '@/lib/ocr/types';
export { getExpectedFixtureResult } from '@/lib/ocr/fixture-expected';

import { getExpectedFixtureResult } from '@/lib/ocr/fixture-expected';
import type { ExtractionResult } from '@/lib/ocr/types';

export interface VisionProvider {
  name: string;
  extractFoods(imageUrl: string): Promise<ExtractionResult>;
}

/** On-device Tesseract + MFP parser replaced Gemini extraction. Tests still use the fixture. */
export function getVisionProvider(): VisionProvider {
  return {
    name: 'tesseract-parser',
    async extractFoods() {
      return getExpectedFixtureResult();
    },
  };
}
