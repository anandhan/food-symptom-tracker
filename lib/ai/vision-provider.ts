// Vision provider interface for food extraction

import { StageError, classifyUnknownError } from '@/lib/ai/extraction-errors';
import { generateContentWithFallback, resolveGeminiModel } from '@/lib/ai/gemini-model';
import { loadImageBytes } from '@/lib/images/load-image-bytes';

export interface ExtractionResult {
  breakfast: FoodEntry[];
  lunch: FoodEntry[];
  dinner: FoodEntry[];
  snacks: FoodEntry[];
  drinks: FoodEntry[];
  raw_ocr_text: string;
  confidence: number;
  extracted_date?: string; // Date found in image (YYYY-MM-DD)
}

export interface FoodEntry {
  text: string; // Full text as extracted
  brand?: string; // Extracted brand
  food_name?: string; // Food name without brand
  quantity?: string; // Serving size
  is_drink?: boolean; // Tag for drinks analysis
  // Optional nutrition data
  calories?: number;
  carbs?: number;
  fat?: number;
  protein?: number;
  fiber?: number;
  sugar?: number;
}

export interface VisionProvider {
  name: string;
  extractFoods(imageUrl: string): Promise<ExtractionResult>;
}

// Factory to get the configured vision provider
export function getVisionProvider(): VisionProvider {
  const provider = process.env.VISION_PROVIDER || (process.env.GEMINI_API_KEY ? 'gemini' : 'mock');
  
  switch (provider.toLowerCase()) {
    case 'gemini':
      if (!process.env.GEMINI_API_KEY) {
        console.warn('GEMINI_API_KEY not set, falling back to mock provider');
        return new MockVisionProvider();
      }
      return new GeminiVisionProvider();
    
    case 'mock':
      return new MockVisionProvider();
    
    default:
      throw new Error(`Unknown vision provider: ${provider}`);
  }
}

// Gemini provider implementation
class GeminiVisionProvider implements VisionProvider {
  name = 'gemini';

  async extractFoods(imageUrl: string): Promise<ExtractionResult> {
    if (!process.env.GEMINI_API_KEY) {
      throw new StageError('gemini-auth', 'Gemini API key is not configured', 'GEMINI_API_KEY is missing');
    }

    const { bytes, mimeType } = await loadImageBytes(imageUrl);
    if (bytes.length > 4 * 1024 * 1024) {
      throw new StageError(
        'size',
        'Image is too large for extraction',
        `Decoded image is ${bytes.length} bytes`
      );
    }

    const model = resolveGeminiModel(process.env.GEMINI_EXTRACTION_MODEL);
    const apiKey = process.env.GEMINI_API_KEY;

    try {
      const { text } = await generateContentWithFallback({
        apiKey,
        model,
        contents: [
          {
            inlineData: {
              mimeType,
              data: bytes.toString('base64'),
            },
          },
          { text: this.buildExtractionPrompt() },
        ],
        config: {
          responseMimeType: 'application/json',
        },
      });
      if (!text) {
        throw new StageError('parse', 'Gemini returned an empty response', `model=${model}`);
      }

      let extracted: unknown;
      try {
        extracted = JSON.parse(text);
      } catch {
        throw new StageError('parse', 'Gemini returned invalid JSON', text.slice(0, 240));
      }

      return this.normalizeResponse(extracted);
    } catch (error) {
      console.error('Gemini extraction failed:', error);
      throw classifyUnknownError(error, 'extract');
    }
  }

  private buildExtractionPrompt(): string {
    return `You are extracting a daily food log from an image. The image may be:
1. A MyFitnessPal-style food diary with date header, meal sections (Breakfast, Lunch, Dinner, Snacks), and rows formatted as "Brand - Food name, serving size" with nutrition columns
2. A handwritten or typed list of foods
3. A photo of an actual meal

IMPORTANT INSTRUCTIONS:

For MyFitnessPal-style diaries:
- Extract the date from the header (e.g., "Your Food Diary For: Monday, October 5, 2026")
- Use the diary's own meal section headings (Breakfast, Lunch, Dinner, Snacks)
- For each food row, split into: brand, food_name, quantity
- Capture nutrition values if visible: calories, carbs, fat, protein, fiber, sugar
- IGNORE these rows: totals, "Your Daily Goal", "Remaining", "Add Food | Quick Tools", any UI elements
- Detect drinks (coffee, latte, tea, water, juice, soda, smoothie, etc.) even if they appear in Breakfast/Lunch/Dinner/Snacks and tag them with is_drink: true
- If drinks are in their own section, put them in "drinks" array
- If drinks are mixed with food in meal sections, keep them in that meal BUT tag is_drink: true

For handwritten/typed lists:
- Parse as best you can
- Categorize by meal based on context clues or typical meal patterns
- If unclear, make reasonable assumptions

FOOD ENTRY FORMAT:
{
  "text": "full text as it appears",
  "brand": "brand name if present",
  "food_name": "food without brand",
  "quantity": "serving size if present",
  "is_drink": true/false,
  "calories": number or null,
  "carbs": number or null,
  "fat": number or null,
  "protein": number or null,
  "fiber": number or null,
  "sugar": number or null
}

Return JSON in this exact structure:
{
  "breakfast": [array of food entries],
  "lunch": [array of food entries],
  "dinner": [array of food entries],
  "snacks": [array of food entries],
  "drinks": [array of drink entries that were in their own section],
  "raw_ocr_text": "all text you can read from the image",
  "confidence": 0.0 to 1.0,
  "extracted_date": "YYYY-MM-DD if date found in image, otherwise null"
}

EXAMPLE for "Dunkin' Donuts - Latte With Sugar - Small, 10 oz" with nutrition values:
{
  "text": "Dunkin' Donuts - Latte With Sugar - Small, 10 oz",
  "brand": "Dunkin' Donuts",
  "food_name": "Latte With Sugar",
  "quantity": "Small, 10 oz",
  "is_drink": true,
  "calories": 170,
  "carbs": 27,
  "fat": 6,
  "protein": 6,
  "fiber": 0,
  "sugar": 27
}`;
  }

  private normalizeResponse(raw: any): ExtractionResult {
    return {
      breakfast: this.normalizeEntries(raw.breakfast || []),
      lunch: this.normalizeEntries(raw.lunch || []),
      dinner: this.normalizeEntries(raw.dinner || []),
      snacks: this.normalizeEntries(raw.snacks || []),
      drinks: this.normalizeEntries(raw.drinks || []),
      raw_ocr_text: raw.raw_ocr_text || '',
      confidence: raw.confidence || 0.5,
      extracted_date: raw.extracted_date || undefined,
    };
  }

  private normalizeEntries(entries: any[]): FoodEntry[] {
    return entries.map((entry) => {
      if (typeof entry === 'string') {
        // Legacy string format
        return { text: entry };
      }
      return {
        text: entry.text || entry.food_name || '',
        brand: entry.brand || undefined,
        food_name: entry.food_name || undefined,
        quantity: entry.quantity || undefined,
        is_drink: entry.is_drink || false,
        calories: entry.calories || undefined,
        carbs: entry.carbs || undefined,
        fat: entry.fat || undefined,
        protein: entry.protein || undefined,
        fiber: entry.fiber || undefined,
        sugar: entry.sugar || undefined,
      };
    });
  }
}

// Mock provider for testing without API key
class MockVisionProvider implements VisionProvider {
  name = 'mock';

  async extractFoods(imageUrl: string): Promise<ExtractionResult> {
    console.log('Using mock vision provider for URL:', imageUrl);
    
    // Check if this is the test fixture (by checking filename or uploads folder)
    const isTestFixture = imageUrl.includes('myfitnesspal-example') || 
                         imageUrl.includes('c18b5182df197575edc668b4138be7d2b85a2422aca0ec63fe067e18c6085e5c') ||
                         imageUrl.includes('75d3.png');
    
    // For any image in the uploads folder or an inline/data URL (no-Blob path), return mock data
    const isUploadsImage =
      imageUrl.includes('/uploads/') ||
      imageUrl.startsWith('local://') ||
      imageUrl.startsWith('data:') ||
      imageUrl.startsWith('inline://');
    
    if (isTestFixture || isUploadsImage) {
      console.log('Detected uploaded image - returning comprehensive mock MyFitnessPal data');
      return this.getMockMyFitnessPalResponse();
    }
    
    // Default empty response for other cases
    console.log('No fixture detected - returning empty');
    return {
      breakfast: [],
      lunch: [],
      dinner: [],
      snacks: [],
      drinks: [],
      raw_ocr_text: 'Mock extraction - please enter foods manually',
      confidence: 0.0,
    };
  }

  private getMockMyFitnessPalResponse(): ExtractionResult {
    // Mocked response for the MyFitnessPal test fixture
    return {
      breakfast: [
        {
          text: 'Homemade - Omlette, 100 g',
          brand: 'Homemade',
          food_name: 'Omlette',
          quantity: '100 g',
          is_drink: false,
          calories: 155,
          carbs: 1,
          fat: 11,
          protein: 13,
          fiber: 0,
          sugar: 1,
        },
        {
          text: "Dunkin' Donuts - Latte With Sugar - Small, 10 oz",
          brand: "Dunkin' Donuts",
          food_name: 'Latte With Sugar',
          quantity: 'Small, 10 oz',
          is_drink: true,
          calories: 170,
          carbs: 27,
          fat: 6,
          protein: 6,
          fiber: 0,
          sugar: 27,
        },
      ],
      lunch: [
        {
          text: 'Wellwish Dumplings - Chicken Dumplings, 7.5 pieces',
          brand: 'Wellwish Dumplings',
          food_name: 'Chicken Dumplings',
          quantity: '7.5 pieces',
          is_drink: false,
          calories: 270,
          carbs: 33,
          fat: 6,
          protein: 21,
          fiber: 1,
          sugar: 5,
        },
        {
          text: 'Metamucil - Metamucil - Sugar Free Orange Smooth, 1 rounded tsp',
          brand: 'Metamucil',
          food_name: 'Sugar Free Orange Smooth',
          quantity: '1 rounded tsp',
          is_drink: false,
          calories: 20,
          carbs: 5,
          fat: 0,
          protein: 0,
          fiber: 3,
          sugar: 0,
        },
      ],
      dinner: [
        {
          text: 'Idly - Idly, 200 gram',
          brand: 'Idly',
          food_name: 'Idly',
          quantity: '200 gram',
          is_drink: false,
          calories: 312,
          carbs: 60,
          fat: 4,
          protein: 10,
          fiber: 0,
          sugar: 0,
        },
        {
          text: 'Potato wedge - Potato wedge, 84 g',
          brand: 'Potato wedge',
          food_name: 'Potato wedge',
          quantity: '84 g',
          is_drink: false,
          calories: 130,
          carbs: 18,
          fat: 6,
          protein: 2,
          fiber: 0,
          sugar: 0,
        },
      ],
      snacks: [
        {
          text: 'Nature Valley - Crunchy Oats & Honey Granola, 0.38 cup',
          brand: 'Nature Valley',
          food_name: 'Crunchy Oats & Honey Granola',
          quantity: '0.38 cup',
          is_drink: false,
          calories: 180,
          carbs: 29,
          fat: 7,
          protein: 3,
          fiber: 2,
          sugar: 11,
        },
        {
          text: 'Starbucks Coffee Company - Espresso & Cream Beverage, 1 can',
          brand: 'Starbucks Coffee Company',
          food_name: 'Espresso & Cream Beverage',
          quantity: '1 can',
          is_drink: true,
          calories: 140,
          carbs: 18,
          fat: 6,
          protein: 4,
          fiber: 0,
          sugar: 18,
        },
        {
          text: 'Kirkland signature coconut water - Coconut water, 330 ml',
          brand: 'Kirkland signature',
          food_name: 'Coconut water',
          quantity: '330 ml',
          is_drink: true,
          calories: 60,
          carbs: 15,
          fat: 0,
          protein: 0,
          fiber: 0,
          sugar: 13,
        },
      ],
      drinks: [],
      raw_ocr_text: "Your Food Diary For: Monday, October 5, 2026\n\nBreakfast\nHomemade - Omlette, 100 g | 155 | 1 | 11 | 13 | 0 | 1\nDunkin' Donuts - Latte With Sugar - Small, 10 oz | 170 | 27 | 6 | 6 | 0 | 27\n...",
      confidence: 0.95,
      extracted_date: '2026-10-05',
    };
  }
}
