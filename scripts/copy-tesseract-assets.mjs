/**
 * Copy self-hosted Tesseract.js worker/core/lang files into public/ocr
 * so iPhone Safari and the installed PWA never depend on a live CDN.
 */
import { copyFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dest = join(root, 'public', 'ocr');

const copies = [
  ['node_modules/tesseract.js/dist/worker.min.js', 'worker.min.js'],
  ['node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm.js'],
  ['node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm', 'tesseract-core-simd-lstm.wasm'],
  ['node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js', 'tesseract-core-lstm.wasm.js'],
  ['node_modules/tesseract.js-core/tesseract-core-lstm.wasm', 'tesseract-core-lstm.wasm'],
];

const TRAINEDDATA_URLS = [
  'https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz',
  'https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng@1.0.0/4.0.0_best_int/eng.traineddata.gz',
  'https://tessdata.projectnaptha.com/4.0.0/eng.traineddata.gz',
];

mkdirSync(dest, { recursive: true });

for (const [src, name] of copies) {
  const from = join(root, src);
  const to = join(dest, name);
  if (!existsSync(from)) {
    console.warn(`[copy-tesseract] missing ${src}`);
    continue;
  }
  copyFileSync(from, to);
  console.log(`[copy-tesseract] ${name} (${statSync(to).size} bytes)`);
}

const trainedDest = join(dest, 'eng.traineddata.gz');
if (existsSync(trainedDest) && statSync(trainedDest).size > 10_000) {
  console.log(`[copy-tesseract] eng.traineddata.gz already present (${statSync(trainedDest).size} bytes)`);
} else {
  let saved = false;
  for (const url of TRAINEDDATA_URLS) {
    try {
      console.log(`[copy-tesseract] downloading ${url}`);
      const res = await fetch(url);
      if (!res.ok) {
        console.warn(`[copy-tesseract] ${url} -> ${res.status}`);
        continue;
      }
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 10_000) {
        console.warn(`[copy-tesseract] ${url} too small (${buf.length})`);
        continue;
      }
      const { writeFileSync } = await import('node:fs');
      writeFileSync(trainedDest, buf);
      console.log(`[copy-tesseract] eng.traineddata.gz (${buf.length} bytes)`);
      saved = true;
      break;
    } catch (error) {
      console.warn(`[copy-tesseract] download failed: ${error instanceof Error ? error.message : error}`);
    }
  }
  if (!saved) {
    console.warn('[copy-tesseract] could not download eng.traineddata.gz');
    process.exitCode = 1;
  }
}
