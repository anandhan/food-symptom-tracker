import type { ExtractionResult } from './types';

/** Ground-truth items for tests/fixtures/myfitnesspal-example.png */
export const EXPECTED_FIXTURE_MATCHERS: Array<{ meal: 'breakfast' | 'lunch' | 'dinner' | 'snacks'; match: RegExp }> =
  [
    { meal: 'breakfast', match: /omlette/i },
    { meal: 'breakfast', match: /latte/i },
    { meal: 'lunch', match: /dumpling/i },
    { meal: 'lunch', match: /metamucil|orange smooth/i },
    { meal: 'dinner', match: /idly/i },
    { meal: 'dinner', match: /potato/i },
    { meal: 'snacks', match: /granola|nature valley/i },
    { meal: 'snacks', match: /espresso/i },
    { meal: 'snacks', match: /coconut/i },
  ];

export function getExpectedFixtureResult(): ExtractionResult {
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
        food_name: 'Metamucil - Sugar Free Orange Smooth',
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
        brand: 'Kirkland signature coconut water',
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
    raw_ocr_text:
      "Your Food Diary For: Monday, October 5, 2026\n\nBreakfast\nHomemade - Omlette, 100 g | 155 | 1 | 11 | 13 | 0 | 1\nDunkin' Donuts - Latte With Sugar - Small, 10 oz | 170 | 27 | 6 | 6 | 0 | 27\n...",
    confidence: 0.95,
    extracted_date: '2026-10-05',
    model: 'tesseract-mfp-parser',
  };
}

export function scoreFixtureAccuracy(result: ExtractionResult): {
  expected: number;
  found: number;
  matched: number;
  missed: string[];
  extra: string[];
} {
  const missed: string[] = [];
  let matched = 0;
  for (const expected of EXPECTED_FIXTURE_MATCHERS) {
    const hit = result[expected.meal].some((item) => expected.match.test(`${item.text} ${item.food_name || ''}`));
    if (hit) matched += 1;
    else missed.push(`${expected.meal}:${expected.match}`);
  }
  const found =
    result.breakfast.length +
    result.lunch.length +
    result.dinner.length +
    result.snacks.length +
    result.drinks.length;
  const extra = [
    ...result.breakfast,
    ...result.lunch,
    ...result.dinner,
    ...result.snacks,
    ...result.drinks,
  ]
    .filter((item) => !EXPECTED_FIXTURE_MATCHERS.some((expected) => expected.match.test(`${item.text} ${item.food_name || ''}`)))
    .map((item) => item.text);
  return {
    expected: EXPECTED_FIXTURE_MATCHERS.length,
    found,
    matched,
    missed,
    extra,
  };
}
