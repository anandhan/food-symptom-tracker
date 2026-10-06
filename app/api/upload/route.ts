// Image upload API endpoint with local file storage fallback

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { put } from '@vercel/blob';
import { prisma } from '@/lib/db';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const session = await auth();
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
    let publicUrl: string;

    // Try Vercel Blob first, fallback to local storage
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      try {
        const blob = await put(file.name, file, {
          access: 'public',
          token: process.env.BLOB_READ_WRITE_TOKEN,
        });
        storageKey = blob.url;
        publicUrl = blob.url;
      } catch (error) {
        console.error('Vercel Blob upload failed, using local:', error);
        // Save locally
        const { key, url } = await saveLocally(file);
        storageKey = key;
        publicUrl = url;
      }
    } else {
      // Development - save to local uploads directory
      const { key, url } = await saveLocally(file);
      storageKey = key;
      publicUrl = url;
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
      url: publicUrl,
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

async function saveLocally(file: File): Promise<{ key: string; url: string }> {
  const uploadsDir = join(process.cwd(), 'uploads');
  
  // Ensure uploads directory exists
  try {
    await mkdir(uploadsDir, { recursive: true });
  } catch (error) {
    // Directory may already exist
  }

  // Generate unique filename
  const buffer = Buffer.from(await file.arrayBuffer());
  const filename = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
  const filepath = join(uploadsDir, filename);

  await writeFile(filepath, buffer);

  return {
    key: `local://${filename}`,
    url: `/uploads/${filename}`,
  };
}
