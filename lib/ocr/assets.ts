/** Self-hosted Tesseract.js files under /public/ocr */
export const OCR_PUBLIC_PREFIX = '/ocr';

export const OCR_ASSET_PATHS = [
  '/ocr/worker.min.js',
  '/ocr/tesseract-core-simd-lstm.wasm.js',
  '/ocr/tesseract-core-simd-lstm.wasm',
  '/ocr/tesseract-core-lstm.wasm.js',
  '/ocr/tesseract-core-lstm.wasm',
  '/ocr/eng.traineddata.gz',
] as const;

export const TESSERACT_MODEL_VERSION = 'tesseract.js-5';
