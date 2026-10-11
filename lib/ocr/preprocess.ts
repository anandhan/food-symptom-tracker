export type PreprocessSource = HTMLImageElement | HTMLCanvasElement | ImageBitmap;

export interface PreprocessResult {
  canvas: HTMLCanvasElement;
  inverted: boolean;
  scale: number;
  width: number;
  height: number;
}

function sampleBackgroundLuma(data: Uint8ClampedArray, width: number, height: number): number {
  const points: Array<[number, number]> = [
    [2, 2],
    [width - 3, 2],
    [2, height - 3],
    [width - 3, height - 3],
    [Math.floor(width / 2), 2],
    [Math.floor(width / 2), height - 3],
  ];
  let total = 0;
  let count = 0;
  for (const [x, y] of points) {
    if (x < 0 || y < 0 || x >= width || y >= height) continue;
    const i = (y * width + x) * 4;
    total += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    count += 1;
  }
  return count ? total / count : 255;
}

/**
 * Scale small screenshots ~2x, grayscale, boost contrast, invert MFP dark mode.
 */
export function preprocessImageForOcr(source: PreprocessSource): PreprocessResult {
  const srcWidth = 'width' in source ? source.width : 0;
  const srcHeight = 'height' in source ? source.height : 0;
  if (!srcWidth || !srcHeight) {
    throw new Error('Image has no dimensions');
  }

  const scale = srcWidth < 1000 ? 2 : srcWidth < 1400 ? 1.5 : 1;
  const width = Math.round(srcWidth * scale);
  const height = Math.round(srcHeight * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Could not create canvas context');

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source as CanvasImageSource, 0, 0, width, height);

  const image = ctx.getImageData(0, 0, width, height);
  const { data } = image;
  const background = sampleBackgroundLuma(data, width, height);
  const inverted = background < 110;

  for (let i = 0; i < data.length; i += 4) {
    let luma = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    if (inverted) luma = 255 - luma;
    // Contrast stretch then hard-ish threshold so diary rows stay crisp.
    const contrasted = Math.max(0, Math.min(255, (luma - 128) * 1.45 + 128));
    const value = contrasted > 165 ? 255 : contrasted < 90 ? 0 : contrasted;
    data[i] = value;
    data[i + 1] = value;
    data[i + 2] = value;
  }

  ctx.putImageData(image, 0, 0);
  return { canvas, inverted, scale, width, height };
}

export function loadFileImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not decode image'));
    };
    image.src = url;
  });
}
