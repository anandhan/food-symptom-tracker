import * as fs from 'fs';
import * as path from 'path';
import {
  resolveGeminiModel,
  resolveGeminiAnalysisModel,
  DEFAULT_GEMINI_MODEL,
  DEFAULT_GEMINI_ANALYSIS_MODEL,
  isRetiredGeminiModel,
  isGeminiNotFound,
} from '@/lib/ai/gemini-model';
import { classifyUnknownError, errorPayload, StageError } from '@/lib/ai/extraction-errors';
import { storeUploadedImage } from '@/lib/images/store-uploaded-image';
import { getVisionProvider } from '@/lib/ai/vision-provider';

const fixturePath = path.join(process.cwd(), 'tests', 'fixtures', 'myfitnesspal-example.png');
const uploadsFixture = path.join(
  process.cwd(),
  'uploads',
  'c18b5182df197575edc668b4138be7d2b85a2422aca0ec63fe067e18c6085e5c_75d3.png'
);

function readFixture(): Buffer {
  if (fs.existsSync(fixturePath)) return fs.readFileSync(fixturePath);
  return fs.readFileSync(uploadsFixture);
}

describe('resolveGeminiModel', () => {
  it('defaults when unset or blank', () => {
    expect(DEFAULT_GEMINI_MODEL).toBe('gemini-3.8-flash');
    expect(DEFAULT_GEMINI_ANALYSIS_MODEL).toBe('gemini-3.8-flash');
    expect(resolveGeminiModel(undefined)).toBe(DEFAULT_GEMINI_MODEL);
    expect(resolveGeminiModel('')).toBe(DEFAULT_GEMINI_MODEL);
    expect(resolveGeminiModel('   ')).toBe(DEFAULT_GEMINI_MODEL);
  });

  it('passes unknown model ids through as-is', () => {
    expect(resolveGeminiModel('gpt-4o')).toBe('gpt-4o');
    expect(resolveGeminiModel('not-a-model')).toBe('not-a-model');
    expect(resolveGeminiModel('gemini-2.0-flash')).toBe('gemini-2.0-flash');
    expect(resolveGeminiModel('models/gemini-3.8-flash')).toBe('gemini-3.8-flash');
  });

  it('maps retired gemini-2.5-* ids to the default', () => {
    expect(isRetiredGeminiModel('gemini-2.5-flash')).toBe(true);
    expect(isRetiredGeminiModel('models/gemini-2.5-pro')).toBe(true);
    expect(resolveGeminiModel('gemini-2.5-flash')).toBe(DEFAULT_GEMINI_MODEL);
    expect(resolveGeminiModel('models/gemini-2.5-pro')).toBe(DEFAULT_GEMINI_MODEL);
    expect(resolveGeminiAnalysisModel('gemini-2.5-pro')).toBe(DEFAULT_GEMINI_ANALYSIS_MODEL);
    expect(resolveGeminiAnalysisModel('')).toBe(DEFAULT_GEMINI_ANALYSIS_MODEL);
  });

  it('detects Gemini NOT_FOUND / retired-model errors', () => {
    expect(
      isGeminiNotFound(
        new Error('This model models/gemini-2.5-flash is no longer available to new users. Please update your code to use models/gemini-3.8-flash')
      )
    ).toBe(true);
    expect(isGeminiNotFound(new Error('404 NOT_FOUND'))).toBe(true);
    expect(isGeminiNotFound(new Error('API_KEY_INVALID'))).toBe(false);
  });
});

describe('extraction error payload', () => {
  it('returns {error, code, detail}', () => {
    const payload = errorPayload(new StageError('gemini-auth', 'Gemini rejected the API key', 'API_KEY_INVALID'));
    expect(payload).toMatchObject({
      error: 'Gemini rejected the API key',
      code: 'gemini-auth',
      detail: 'API_KEY_INVALID',
      status: 401,
    });
  });

  it('classifies model and timeout errors', () => {
    expect(classifyUnknownError(new Error('models/gemini-foo is not found')).code).toBe('gemini-model');
    expect(classifyUnknownError(new Error('Deadline exceeded / timeout')).code).toBe('timeout');
    expect(classifyUnknownError(new Error('Unexpected token < in JSON')).code).toBe('parse');
    expect(classifyUnknownError(new Error('Payload too large')).code).toBe('size');
  });

  it('classifies high-demand 503s as gemini-busy', () => {
    const staged = classifyUnknownError(
      new Error('503 UNAVAILABLE This model is currently experiencing high demand. Please try again later.')
    );
    expect(staged.code).toBe('gemini-busy');
    expect(errorPayload(staged)).toMatchObject({
      error: 'Gemini is busy right now, try again in a minute',
      code: 'gemini-busy',
      status: 503,
    });
    expect(errorPayload(staged).detail).toMatch(/high demand/);
    expect(classifyUnknownError(new Error('429 RESOURCE_EXHAUSTED')).code).toBe('gemini-busy');
  });
});

describe('no-Blob-token image path', () => {
  it('returns an inline data URL on Vercel when Blob token is missing', async () => {
    const prevVercel = process.env.VERCEL;
    const prevBlob = process.env.BLOB_READ_WRITE_TOKEN;
    process.env.VERCEL = '1';
    delete process.env.BLOB_READ_WRITE_TOKEN;

    const fixture = readFixture();
    const file = new File([new Uint8Array(fixture)], 'myfitnesspal-example.png', { type: 'image/png' });
    const stored = await storeUploadedImage(file);

    expect(stored.storedInBlob).toBe(false);
    expect(stored.storageKey).toBe('inline://skipped');
    expect(stored.url.startsWith('data:image/png;base64,')).toBe(true);
    expect(stored.warning).toMatch(/BLOB_READ_WRITE_TOKEN/i);

    if (prevVercel === undefined) delete process.env.VERCEL;
    else process.env.VERCEL = prevVercel;
    if (prevBlob === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
    else process.env.BLOB_READ_WRITE_TOKEN = prevBlob;
  });
});

describe('mock provider with fixture and inline image', () => {
  it('extracts the MyFitnessPal fixture from a disk path', async () => {
    const prev = process.env.VISION_PROVIDER;
    process.env.VISION_PROVIDER = 'mock';
    const provider = getVisionProvider();
    const result = await provider.extractFoods(
      '/uploads/c18b5182df197575edc668b4138be7d2b85a2422aca0ec63fe067e18c6085e5c_75d3.png'
    );
    expect(result.extracted_date).toBe('2026-10-05');
    expect(result.breakfast.some((i) => /Latte With Sugar/i.test(i.text))).toBe(true);
    process.env.VISION_PROVIDER = prev;
  });

  it('extracts the fixture from an inline data URL (no Blob)', async () => {
    const prev = process.env.VISION_PROVIDER;
    process.env.VISION_PROVIDER = 'mock';
    const fixture = readFixture();
    const dataUrl = `data:image/png;base64,${fixture.toString('base64')}`;
    const provider = getVisionProvider();
    const result = await provider.extractFoods(dataUrl);
    expect(result.extracted_date).toBe('2026-10-05');
    expect(result.lunch.some((i) => /Dumpling/i.test(i.text))).toBe(true);
    process.env.VISION_PROVIDER = prev;
  });
});
