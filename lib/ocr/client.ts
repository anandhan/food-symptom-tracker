import { OCR_PUBLIC_PREFIX, TESSERACT_MODEL_VERSION } from './assets';
import { parseMfpDiary } from './mfp-parser';
import { loadFileImage, preprocessImageForOcr } from './preprocess';
import type { ExtractionResult, OcrLine } from './types';

export type OcrProgress = {
  status: string;
  progress: number;
};

type ProgressFn = (event: OcrProgress) => void;

function ocrAssetUrl(path: string): string {
  if (typeof window === 'undefined') return path;
  return new URL(path, window.location.origin).href;
}

export async function recognizeImageToLines(
  file: Blob,
  onProgress?: ProgressFn
): Promise<{ lines: OcrLine[]; raw: string; meanConfidence: number }> {
  if (typeof window === 'undefined') {
    throw new Error('On-device OCR runs in the browser');
  }

  onProgress?.({ status: 'Preparing image', progress: 0.02 });
  const image = await loadFileImage(file);
  const processed = preprocessImageForOcr(image);

  const { createWorker, PSM } = await import('tesseract.js');
  const worker = await createWorker('eng', 1, {
    workerPath: ocrAssetUrl(`${OCR_PUBLIC_PREFIX}/worker.min.js`),
    corePath: ocrAssetUrl(`${OCR_PUBLIC_PREFIX}/`),
    langPath: ocrAssetUrl(`${OCR_PUBLIC_PREFIX}/`),
    gzip: true,
    workerBlobURL: true,
    logger: (message) => {
      const progress = typeof message.progress === 'number' ? message.progress : 0;
      onProgress?.({
        status: message.status || 'Recognizing',
        progress: Math.max(0.05, Math.min(0.99, progress)),
      });
    },
  });

  try {
    await worker.setParameters({
      tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
      preserve_interword_spaces: '1',
      user_defined_dpi: processed.scale >= 2 ? '220' : '180',
    });
    const { data } = await worker.recognize(processed.canvas);
    const lines: OcrLine[] = (data.lines || []).map((line) => ({
      text: line.text || '',
      confidence: typeof line.confidence === 'number' ? line.confidence : 0,
      words: (line.words || []).map((word) => ({
        text: word.text || '',
        confidence: typeof word.confidence === 'number' ? word.confidence : 0,
      })),
    }));
    onProgress?.({ status: 'Parsing diary', progress: 1 });
    return {
      lines,
      raw: data.text || lines.map((line) => line.text).join('\n'),
      meanConfidence: typeof data.confidence === 'number' ? data.confidence : 0,
    };
  } finally {
    await worker.terminate();
  }
}

export async function extractFoodsFromImage(
  file: Blob,
  onProgress?: ProgressFn
): Promise<ExtractionResult> {
  const { lines, raw, meanConfidence } = await recognizeImageToLines(file, onProgress);
  const parsed = parseMfpDiary(lines);
  parsed.raw_ocr_text = raw || parsed.raw_ocr_text;
  parsed.model = TESSERACT_MODEL_VERSION;
  if (meanConfidence > 0) {
    parsed.confidence = meanConfidence / 100;
  }
  return parsed;
}
