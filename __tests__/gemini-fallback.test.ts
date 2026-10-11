import {
  generateContentWithFallback,
  DEFAULT_GEMINI_MODEL,
  isGeminiTransient,
  backoffDelayMs,
} from '@/lib/ai/gemini-model';

const generateContent = jest.fn();
const list = jest.fn();

jest.mock('@google/genai', () => ({
  GoogleGenAI: jest.fn().mockImplementation(() => ({
    models: { generateContent, list },
  })),
}));

describe('generateContentWithFallback', () => {
  const sleep = jest.fn(async () => undefined);

  beforeEach(() => {
    generateContent.mockReset();
    list.mockReset();
    sleep.mockClear();
  });

  it('retries once with the default flash model after a 404', async () => {
    generateContent
      .mockRejectedValueOnce(
        new Error(
          'This model models/gemini-2.5-flash is no longer available to new users. Please update your code to use models/gemini-3.8-flash'
        )
      )
      .mockResolvedValueOnce({ text: '{"ok":true}' });
    list.mockResolvedValue({
      async *[Symbol.asyncIterator]() {
        yield { name: 'models/gemini-3.8-flash' };
      },
    });

    const result = await generateContentWithFallback({
      apiKey: 'test-key',
      model: 'gemini-old-retired',
      contents: 'ping',
      sleep,
    });

    expect(generateContent).toHaveBeenCalledTimes(2);
    expect(generateContent.mock.calls[1][0].model).toBe(DEFAULT_GEMINI_MODEL);
    expect(result).toEqual({ text: '{"ok":true}', model: DEFAULT_GEMINI_MODEL });
    expect(sleep).not.toHaveBeenCalled();
  });

  it('does not retry auth errors', async () => {
    generateContent.mockRejectedValueOnce(new Error('API_KEY_INVALID'));
    await expect(
      generateContentWithFallback({
        apiKey: 'test-key',
        model: 'gemini-3.8-flash',
        contents: 'ping',
        sleep,
      })
    ).rejects.toThrow('API_KEY_INVALID');
    expect(generateContent).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('retries the same model after 503 UNAVAILABLE with backoff', async () => {
    generateContent
      .mockRejectedValueOnce(
        new Error('503 UNAVAILABLE This model is currently experiencing high demand. Please try again later.')
      )
      .mockResolvedValueOnce({ text: '{"ok":true}' });

    const result = await generateContentWithFallback({
      apiKey: 'test-key',
      model: 'gemini-3.8-flash',
      contents: 'ping',
      sleep,
      random: () => 0.5,
    });

    expect(result).toEqual({ text: '{"ok":true}', model: 'gemini-3.8-flash' });
    expect(generateContent).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(sleep).toHaveBeenCalledWith(1000);
  });

  it('retries 429 RESOURCE_EXHAUSTED then succeeds', async () => {
    generateContent
      .mockRejectedValueOnce(new Error('429 RESOURCE_EXHAUSTED'))
      .mockRejectedValueOnce(new Error('429 RESOURCE_EXHAUSTED'))
      .mockResolvedValueOnce({ text: 'ok' });

    const result = await generateContentWithFallback({
      apiKey: 'test-key',
      model: 'gemini-3.8-flash',
      contents: 'ping',
      sleep,
      random: () => 0.5,
    });

    expect(result.model).toBe('gemini-3.8-flash');
    expect(generateContent).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls.map((call) => call[0])).toEqual([1000, 2000]);
  });

  it('falls back to an alternate flash model after three 503s', async () => {
    generateContent
      .mockRejectedValueOnce(new Error('503 UNAVAILABLE high demand'))
      .mockRejectedValueOnce(new Error('503 UNAVAILABLE high demand'))
      .mockRejectedValueOnce(new Error('503 UNAVAILABLE high demand'))
      .mockResolvedValueOnce({ text: '{"alt":true}' });
    list.mockResolvedValue({
      async *[Symbol.asyncIterator]() {
        yield { name: 'models/gemini-3.8-flash', supportedGenerationMethods: ['generateContent'] };
        yield {
          name: 'models/gemini-3.8-flash-lite',
          supportedGenerationMethods: ['generateContent'],
          inputModalities: ['TEXT', 'IMAGE'],
        };
        yield { name: 'models/gemini-embedding-001', supportedGenerationMethods: ['embedContent'] };
      },
    });

    const result = await generateContentWithFallback({
      apiKey: 'test-key',
      model: 'gemini-3.8-flash',
      contents: 'ping',
      requireImageInput: true,
      sleep,
      random: () => 0.5,
    });

    expect(result).toEqual({ text: '{"alt":true}', model: 'gemini-3.8-flash-lite' });
    expect(generateContent).toHaveBeenCalledTimes(4);
    expect(generateContent.mock.calls[3][0].model).toBe('gemini-3.8-flash-lite');
  });

  it('throws the last transient error when every model fails', async () => {
    generateContent.mockRejectedValue(new Error('503 UNAVAILABLE high demand'));
    list.mockResolvedValue({
      async *[Symbol.asyncIterator]() {
        yield { name: 'models/gemini-3.8-flash-lite', supportedGenerationMethods: ['generateContent'] };
      },
    });

    await expect(
      generateContentWithFallback({
        apiKey: 'test-key',
        model: 'gemini-3.8-flash',
        contents: 'ping',
        sleep,
        random: () => 0.5,
      })
    ).rejects.toThrow(/503 UNAVAILABLE/);
    expect(generateContent.mock.calls.length).toBeGreaterThanOrEqual(4);
  });
});

describe('transient detection and backoff', () => {
  it('detects 503, 429, 500 internal, and network errors', () => {
    expect(isGeminiTransient(new Error('503 UNAVAILABLE high demand'))).toBe(true);
    expect(isGeminiTransient(new Error('429 RESOURCE_EXHAUSTED'))).toBe(true);
    expect(isGeminiTransient(new Error('500 INTERNAL server error'))).toBe(true);
    expect(isGeminiTransient(new Error('fetch failed / ECONNRESET'))).toBe(true);
    expect(isGeminiTransient(new Error('API_KEY_INVALID'))).toBe(false);
    expect(isGeminiTransient(new Error('404 NOT_FOUND'))).toBe(false);
  });

  it('applies exponential backoff with jitter', () => {
    expect(backoffDelayMs(0, () => 0.5)).toBe(1000);
    expect(backoffDelayMs(1, () => 0.5)).toBe(2000);
    expect(backoffDelayMs(2, () => 0.5)).toBe(4000);
    expect(backoffDelayMs(0, () => 0)).toBe(500);
    expect(backoffDelayMs(0, () => 1)).toBe(1500);
  });
});
