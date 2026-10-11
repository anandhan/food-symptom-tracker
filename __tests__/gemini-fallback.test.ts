import { generateContentWithFallback, DEFAULT_GEMINI_MODEL } from '@/lib/ai/gemini-model';

const generateContent = jest.fn();
const list = jest.fn();

jest.mock('@google/genai', () => ({
  GoogleGenAI: jest.fn().mockImplementation(() => ({
    models: { generateContent, list },
  })),
}));

describe('generateContentWithFallback', () => {
  beforeEach(() => {
    generateContent.mockReset();
    list.mockReset();
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
    });

    expect(generateContent).toHaveBeenCalledTimes(2);
    expect(generateContent.mock.calls[1][0].model).toBe(DEFAULT_GEMINI_MODEL);
    expect(result).toEqual({ text: '{"ok":true}', model: DEFAULT_GEMINI_MODEL });
  });

  it('does not retry non-404 errors', async () => {
    generateContent.mockRejectedValueOnce(new Error('API_KEY_INVALID'));
    await expect(
      generateContentWithFallback({
        apiKey: 'test-key',
        model: 'gemini-3.8-flash',
        contents: 'ping',
      })
    ).rejects.toThrow('API_KEY_INVALID');
    expect(generateContent).toHaveBeenCalledTimes(1);
  });
});
