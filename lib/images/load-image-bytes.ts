import { StageError } from '@/lib/ai/extraction-errors';

export async function loadImageBytes(
  imageUrl: string
): Promise<{ bytes: Buffer; mimeType: string }> {
  if (imageUrl.startsWith('data:')) {
    const match = imageUrl.match(/^data:([^;,]+);base64,(.+)$/);
    if (!match) {
      throw new StageError('parse', 'Invalid inline image data', 'data URL was malformed');
    }
    return {
      mimeType: match[1],
      bytes: Buffer.from(match[2], 'base64'),
    };
  }

  if (imageUrl.startsWith('inline://')) {
    throw new StageError(
      'upload/blob',
      'Image was not stored and no inline data was provided',
      'BLOB_READ_WRITE_TOKEN is missing and the client did not send image bytes'
    );
  }

  if (imageUrl.startsWith('/uploads/') || imageUrl.startsWith('local://')) {
    const fs = await import('fs/promises');
    const path = await import('path');
    const filename = imageUrl.replace('/uploads/', '').replace('local://', '');
    const filepath = path.join(process.cwd(), 'uploads', filename);
    const buffer = await fs.readFile(filepath);
    let mimeType = 'image/jpeg';
    if (filename.endsWith('.png')) mimeType = 'image/png';
    else if (filename.endsWith('.jpg') || filename.endsWith('.jpeg')) mimeType = 'image/jpeg';
    else if (filename.endsWith('.gif')) mimeType = 'image/gif';
    else if (filename.endsWith('.webp')) mimeType = 'image/webp';
    return { bytes: buffer, mimeType };
  }

  const imageResponse = await fetch(imageUrl);
  if (!imageResponse.ok) {
    throw new StageError(
      'upload/blob',
      'Failed to fetch the uploaded image',
      `${imageResponse.status} ${imageResponse.statusText}`
    );
  }
  const bytes = Buffer.from(await imageResponse.arrayBuffer());
  const mimeType = imageResponse.headers.get('content-type') || 'image/jpeg';
  return { bytes, mimeType };
}
