import { NextRequest, NextResponse } from 'next/server';
import { getAuthorizedSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { errorPayload, StageError } from '@/lib/ai/extraction-errors';
import { MAX_IMAGE_BYTES, storeUploadedImage } from '@/lib/images/store-uploaded-image';

export const maxDuration = 30;

export async function POST(request: NextRequest) {
  try {
    const session = await getAuthorizedSession();
    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized', code: 'extract', detail: 'Not signed in' },
        { status: 401 }
      );
    }

    const contentLength = Number(request.headers.get('content-length') || 0);
    if (contentLength > 4.5 * 1024 * 1024) {
      throw new StageError(
        'size',
        'Upload exceeds the 4.5MB request limit',
        `Content-Length is ${contentLength} bytes`
      );
    }

    const formData = await request.formData();
    const file = formData.get('image');
    const dailyEntryId = formData.get('dailyEntryId');

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: 'No image provided', code: 'upload/blob', detail: 'form field "image" was missing' },
        { status: 400 }
      );
    }

    if (typeof dailyEntryId !== 'string' || !dailyEntryId) {
      return NextResponse.json(
        { error: 'No dailyEntryId provided', code: 'upload/blob', detail: 'form field "dailyEntryId" was missing' },
        { status: 400 }
      );
    }

    if (file.size > MAX_IMAGE_BYTES) {
      throw new StageError(
        'size',
        'Image is too large',
        `${file.name || 'image'} is ${file.size} bytes; compress it under 4MB`
      );
    }

    const dailyEntry = await prisma.dailyEntry.findUnique({
      where: { id: dailyEntryId },
    });

    if (!dailyEntry || dailyEntry.userId !== session.userId) {
      return NextResponse.json(
        { error: 'Invalid daily entry', code: 'upload/blob', detail: 'Entry not found for this user' },
        { status: 403 }
      );
    }

    const stored = await storeUploadedImage(file);

    const uploadedImage = await prisma.uploadedImage.create({
      data: {
        dailyEntryId,
        storageKey: stored.storageKey,
        mimeType: file.type,
        fileSize: file.size,
        originalFilename: file.name,
      },
    });

    return NextResponse.json({
      id: uploadedImage.id,
      url: stored.url,
      storageKey: stored.storageKey,
      storedInBlob: stored.storedInBlob,
      warning: stored.warning,
    });
  } catch (error) {
    console.error('Upload error:', error);
    const payload = errorPayload(error, 'upload/blob');
    return NextResponse.json(
      { error: payload.error, code: payload.code, detail: payload.detail },
      { status: payload.status }
    );
  }
}
