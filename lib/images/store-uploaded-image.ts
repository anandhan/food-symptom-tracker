import { put } from '@vercel/blob';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';

export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

export type StoredImage = {
  storageKey: string;
  url: string;
  storedInBlob: boolean;
  warning?: string;
};

async function fileToDataUrl(file: File): Promise<string> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const mime = file.type || 'image/jpeg';
  return `data:${mime};base64,${buffer.toString('base64')}`;
}

async function saveLocally(file: File): Promise<StoredImage> {
  const uploadsDir = join(process.cwd(), 'uploads');
  await mkdir(uploadsDir, { recursive: true });
  const buffer = Buffer.from(await file.arrayBuffer());
  const filename = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
  await writeFile(join(uploadsDir, filename), buffer);
  return {
    storageKey: `local://${filename}`,
    url: `/uploads/${filename}`,
    storedInBlob: false,
  };
}

export async function storeUploadedImage(file: File): Promise<StoredImage> {
  const onVercel = Boolean(process.env.VERCEL);
  const token = process.env.BLOB_READ_WRITE_TOKEN;

  if (token) {
    try {
      const blob = await put(file.name || 'diary.jpg', file, {
        access: 'public',
        token,
      });
      return {
        storageKey: blob.url,
        url: blob.url,
        storedInBlob: true,
      };
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'Blob upload failed';
      if (!onVercel) {
        const local = await saveLocally(file);
        return { ...local, warning: `Blob upload failed (${detail}); stored locally` };
      }
      const url = await fileToDataUrl(file);
      return {
        storageKey: 'inline://skipped',
        url,
        storedInBlob: false,
        warning: `Blob upload failed (${detail}); extraction will use an inline image`,
      };
    }
  }

  if (!onVercel) {
    try {
      return await saveLocally(file);
    } catch {
      const url = await fileToDataUrl(file);
      return {
        storageKey: 'inline://skipped',
        url,
        storedInBlob: false,
        warning: 'Local disk storage failed; extraction will use an inline image',
      };
    }
  }

  return {
    storageKey: 'inline://skipped',
    url: await fileToDataUrl(file),
    storedInBlob: false,
    warning: 'BLOB_READ_WRITE_TOKEN is not set; image was not stored and extraction will use an inline copy',
  };
}
