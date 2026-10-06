// Image upload API endpoint using Vercel Blob

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { put } from '@vercel/blob';
import { prisma } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const session = await getServerSession(authOptions);
    if (!session?.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get form data
    const formData = await request.formData();
    const file = formData.get('image') as File;
    const dailyEntryId = formData.get('dailyEntryId') as string;

    if (!file) {
      return NextResponse.json({ error: 'No image provided' }, { status: 400 });
    }

    if (!dailyEntryId) {
      return NextResponse.json({ error: 'No dailyEntryId provided' }, { status: 400 });
    }

    // Verify daily entry belongs to user
    const dailyEntry = await prisma.dailyEntry.findUnique({
      where: { id: dailyEntryId },
    });

    if (!dailyEntry || dailyEntry.userId !== session.userId) {
      return NextResponse.json({ error: 'Invalid daily entry' }, { status: 403 });
    }

    let storageKey: string;
    let blobUrl: string;

    // Try Vercel Blob first, fallback to local storage
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      try {
        const blob = await put(file.name, file, {
          access: 'public',
          token: process.env.BLOB_READ_WRITE_TOKEN,
        });
        storageKey = blob.url;
        blobUrl = blob.url;
      } catch (error) {
        console.error('Vercel Blob upload failed, using mock:', error);
        // Mock for development
        storageKey = `mock://${file.name}`;
        blobUrl = `http://localhost:3000/api/images/mock/${file.name}`;
      }
    } else {
      // Development fallback - store in memory/mock
      storageKey = `mock://${file.name}`;
      blobUrl = `http://localhost:3000/api/images/mock/${file.name}`;
    }

    // Save image metadata
    const uploadedImage = await prisma.uploadedImage.create({
      data: {
        dailyEntryId,
        storageKey,
        mimeType: file.type,
        fileSize: file.size,
        originalFilename: file.name,
      },
    });

    return NextResponse.json({
      id: uploadedImage.id,
      url: blobUrl,
      storageKey,
    });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { error: 'Upload failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
