import { NextRequest, NextResponse } from 'next/server';
import { getAuthorizedSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { getVisionProvider } from '@/lib/ai/vision-provider';
import { errorPayload, StageError } from '@/lib/ai/extraction-errors';
import { resolveGeminiModel } from '@/lib/ai/gemini-model';

export const maxDuration = 60;

const EXTRACT_TIMEOUT_MS = 55_000;

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new StageError('timeout', 'Extraction timed out', `Exceeded ${ms}ms`));
    }, ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getAuthorizedSession();
    if (!session) {
      return NextResponse.json(
        { error: 'Unauthorized', code: 'extract', detail: 'Not signed in' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { imageId, imageUrl, imageBase64, mimeType, dailyEntryId } = body as {
      imageId?: string;
      imageUrl?: string;
      imageBase64?: string;
      mimeType?: string;
      dailyEntryId?: string;
    };

    if (!dailyEntryId) {
      return NextResponse.json(
        { error: 'Missing required fields', code: 'extract', detail: 'dailyEntryId is required' },
        { status: 400 }
      );
    }

    const resolvedUrl =
      imageUrl ||
      (imageBase64
        ? `data:${mimeType || 'image/jpeg'};base64,${imageBase64}`
        : '');

    if (!resolvedUrl) {
      return NextResponse.json(
        { error: 'Missing required fields', code: 'extract', detail: 'imageUrl or imageBase64 is required' },
        { status: 400 }
      );
    }

    const dailyEntry = await prisma.dailyEntry.findUnique({
      where: { id: dailyEntryId },
    });

    if (!dailyEntry || dailyEntry.userId !== session.userId) {
      return NextResponse.json(
        { error: 'Invalid daily entry', code: 'extract', detail: 'Entry not found for this user' },
        { status: 403 }
      );
    }

    const provider = getVisionProvider();
    console.log(`Using vision provider: ${provider.name}`);

    const extractionResult = await withTimeout(
      provider.extractFoods(resolvedUrl),
      EXTRACT_TIMEOUT_MS
    );

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
        modelVersion:
          extractionResult.model ||
          (provider.name === 'gemini'
            ? resolveGeminiModel(process.env.GEMINI_EXTRACTION_MODEL)
            : 'mock'),
        confidenceScore: extractionResult.confidence,
      },
    });

    console.log(`[extract] succeeded model=${extraction.modelVersion}`);
    return NextResponse.json({
      extractionId: extraction.id,
      result: extractionResult,
      model: extraction.modelVersion,
    });
  } catch (error) {
    console.error('Extraction error:', error);
    const payload = errorPayload(error, 'extract');
    return NextResponse.json(
      { error: payload.error, code: payload.code, detail: payload.detail },
      { status: payload.status }
    );
  }
}
