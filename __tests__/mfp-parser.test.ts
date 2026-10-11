import * as fs from 'fs';
import * as path from 'path';
import { inferConceptNames } from '@/lib/ai/food-normalization';
import {
  allParsedItems,
  parseDiaryDate,
  parseMfpDiary,
  softenOcrNoise,
} from '@/lib/ocr/mfp-parser';
import { EXPECTED_FIXTURE_MATCHERS, scoreFixtureAccuracy } from '@/lib/ocr/fixture-expected';
import type { OcrLine } from '@/lib/ocr/types';

const cleanText = fs.readFileSync(
  path.join(process.cwd(), 'tests', 'fixtures', 'mfp-ocr-clean.txt'),
  'utf8'
);
const noisyText = fs.readFileSync(
  path.join(process.cwd(), 'tests', 'fixtures', 'mfp-ocr-noisy.txt'),
  'utf8'
);
const tesseractText = fs.readFileSync(
  path.join(process.cwd(), 'tests', 'fixtures', 'mfp-ocr-tesseract.txt'),
  'utf8'
);
const fixturePng = path.join(process.cwd(), 'tests', 'fixtures', 'myfitnesspal-example.png');
const uploadsPng = path.join(
  process.cwd(),
  'uploads',
  'c18b5182df197575edc668b4138be7d2b85a2422aca0ec63fe067e18c6085e5c_75d3.png'
);

describe('MFP diary parser', () => {
  it('extracts the fixture date and skips totals / Add Food rows', () => {
    const result = parseMfpDiary(cleanText);
    expect(result.extracted_date).toBe('2026-10-05');
    const texts = allParsedItems(result).map((item) => item.text.toLowerCase()).join('\n');
    expect(texts).not.toMatch(/add food/);
    expect(texts).not.toMatch(/quick tools/);
    expect(texts).not.toMatch(/daily goal/);
    expect(texts).not.toMatch(/^totals/);
    expect(texts).not.toMatch(/remaining/);
  });

  it('parses brand, name, portion, calories, and drink tags on the clean fixture', () => {
    const result = parseMfpDiary(cleanText);
    const accuracy = scoreFixtureAccuracy(result);
    // eslint-disable-next-line no-console
    console.log(
      `[fixture-accuracy] clean text: ${accuracy.matched}/${accuracy.expected} expected items matched; found=${accuracy.found}`
    );
    expect(accuracy.matched).toBe(accuracy.expected);
    expect(accuracy.found).toBe(accuracy.expected);

    const omelette = result.breakfast.find((item) => /omlette/i.test(item.text));
    expect(omelette?.brand).toMatch(/homemade/i);
    expect(omelette?.food_name).toMatch(/omlette/i);
    expect(omelette?.quantity).toMatch(/100\s*g/i);
    expect(omelette?.calories).toBe(155);
    expect(omelette?.protein).toBe(13);

    const latte = result.breakfast.find((item) => /latte/i.test(item.text));
    expect(latte?.is_drink).toBe(true);
    expect(latte?.quantity).toMatch(/small/i);
    expect(latte?.calories).toBe(170);

    const coconut = result.snacks.find((item) => /coconut/i.test(item.text));
    expect(coconut?.is_drink).toBe(true);
    expect(coconut?.quantity).toMatch(/330/i);
  });

  it('keeps each item raw OCR text unchanged', () => {
    const result = parseMfpDiary(cleanText);
    const omelette = result.breakfast.find((item) => /omlette/i.test(item.text));
    expect(omelette?.text).toContain('Homemade - Omlette, 100 g');
    expect(omelette?.text).not.toMatch(/eggs/);
  });

  it('tolerates OCR noise, wrapped lines, and two-line serving rows', () => {
    const result = parseMfpDiary(noisyText);
    expect(parseDiaryDate(noisyText)).toBe('2026-10-05');
    expect(result.extracted_date).toBe('2026-10-05');
    const accuracy = scoreFixtureAccuracy(result);
    // eslint-disable-next-line no-console
    console.log(
      `[fixture-accuracy] noisy text: ${accuracy.matched}/${accuracy.expected} expected items matched; found=${accuracy.found}`
    );
    expect(accuracy.matched).toBe(accuracy.expected);

    const omelette = result.breakfast.find((item) => /omlette/i.test(item.text));
    expect(omelette?.quantity).toMatch(/100/);
    expect(omelette?.text).toContain('l00');

    const metamucil = result.lunch.find((item) => /metamucil/i.test(item.text));
    expect(metamucil?.quantity).toMatch(/rounded/i);
    expect(metamucil?.calories).toBe(20);

    const granola = result.snacks.find((item) => /granola/i.test(item.text));
    expect(granola?.text).toMatch(/Honey Granola/i);
  });

  it('parses captured Tesseract output from the fixture screenshot at 9/9', () => {
    const result = parseMfpDiary(tesseractText);
    const accuracy = scoreFixtureAccuracy(result);
    // eslint-disable-next-line no-console
    console.log(
      `[fixture-accuracy] captured Tesseract text: ${accuracy.matched}/${accuracy.expected} expected items matched; found=${accuracy.found}`
    );
    expect(result.extracted_date).toBe('2026-10-05');
    expect(accuracy.matched).toBe(9);
    expect(accuracy.found).toBe(9);
    expect(result.breakfast).toHaveLength(2);
    expect(accuracy.extra).toEqual([]);
  });

  it('flags low-confidence OCR lines for review', () => {
    const lines: OcrLine[] = [
      { text: 'Breakfast', confidence: 90 },
      { text: 'Homemade - Omlette, 100 g 155 1 11 13 0 1', confidence: 42, words: [
        { text: 'Homemade', confidence: 40 },
        { text: 'Omlette', confidence: 38 },
      ] },
    ];
    const result = parseMfpDiary(lines);
    expect(result.breakfast[0]?.needs_review).toBe(true);
    expect(result.breakfast[0]?.ocr_confidence).toBeLessThan(60);
  });

  it('keeps latte composite concepts in the rule-based normalizer', () => {
    const result = parseMfpDiary(cleanText);
    const latte = result.breakfast.find((item) => /latte/i.test(item.text));
    expect(inferConceptNames(latte?.text || '', latte?.brand)).toEqual(
      expect.arrayContaining(['coffee', 'milk'])
    );
  });

  it('softens digit-like OCR noise without rewriting food names', () => {
    expect(softenOcrNoise('• 1O oz 155 kcal')).toMatch(/10 oz 155 kcal/);
    expect(softenOcrNoise("Dunkin' Donuts")).toContain("Dunkin' Donuts");
  });
});

describe('Node Tesseract OCR of the MFP fixture', () => {
  jest.setTimeout(180_000);

  it('OCRs the screenshot when tesseract.js assets are present', async () => {
    const imagePath = fs.existsSync(fixturePng) ? fixturePng : uploadsPng;
    expect(fs.existsSync(imagePath)).toBe(true);

    const langDir = path.join(process.cwd(), 'public', 'ocr');
    const trained = path.join(langDir, 'eng.traineddata.gz');
    if (!fs.existsSync(trained)) {
      console.warn('[fixture-accuracy] skipped live OCR — missing public/ocr/eng.traineddata.gz');
      return;
    }

    const { createWorker } = await import('tesseract.js');
    const worker = await createWorker('eng', 1, {
      langPath: langDir,
      gzip: true,
      cachePath: path.join(process.cwd(), '.next', 'cache', 'tesseract-test'),
      logger: () => {},
    });
    try {
      const { data } = await worker.recognize(imagePath);
      const parsed = parseMfpDiary(data.text || '');
      const accuracy = scoreFixtureAccuracy(parsed);
      // eslint-disable-next-line no-console
      console.log(
        `[fixture-accuracy] live OCR: ${accuracy.matched}/${accuracy.expected} expected items matched; found=${accuracy.found}; date=${parsed.extracted_date || 'none'}`
      );
      expect(parsed.extracted_date).toBe('2026-10-05');
      expect(accuracy.matched).toBe(9);
      expect(accuracy.found).toBe(9);
      expect(EXPECTED_FIXTURE_MATCHERS.length).toBe(9);
    } finally {
      await worker.terminate();
    }
  });
});
