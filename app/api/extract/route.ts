// Food extraction API endpoint

import { NextRequest, NextResponse } from 'next/server';
import { getAuthorizedSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getVisionProvider } from '@/lib/ai/vision-provider';

export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const session = await getAuthorizedSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { imageId, imageUrl, dailyEntryId } = body;

    if (!imageUrl || !dailyEntryId) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Verify daily entry belongs to user
    const dailyEntry = await prisma.dailyEntry.findUnique({
      where: { id: dailyEntryId },
    });

    if (!dailyEntry || dailyEntry.userId !== session.userId) {
      return NextResponse.json({ error: 'Invalid daily entry' }, { status: 403 });
    }

    // Extract foods using vision provider
    const provider = getVisionProvider();
    console.log(`Using vision provider: ${provider.name}`);
    
    const extractionResult = await provider.extractFoods(imageUrl);

    // Save extraction result
    const extraction = await prisma.ocrExtraction.create({
      data: {
        dailyEntryId,
        imageId: imageId || null,
        rawOcrText: extractionResult.raw_ocr_text,
        extractedData: JSON.stringify(extractionResult),
        extractedDate: extractionResult.extracted_date 
          ? new Date(extractionResult.extracted_date)
          : null,
        modelName: provider.name,
        modelVersion: process.env.GEMINI_EXTRACTION_MODEL || 'mock',
        confidenceScore: extractionResult.confidence,
      },
    });

    return NextResponse.json({
      extractionId: extraction.id,
      result: extractionResult,
    });
  } catch (error) {
    console.error('Extraction error:', error);
    return NextResponse.json(
      { 
        error: 'Extraction failed', 
        details: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}
