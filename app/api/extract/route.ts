import { NextRequest, NextResponse } from 'next/server';
import { getAuthorizedSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { errorPayload } from '@/lib/ai/extraction-errors';
import { TESSERACT_MODEL_VERSION } from '@/lib/ocr/assets';
import { emptyExtraction, type ExtractionResult, type FoodEntry } from '@/lib/ocr/types';

export const maxDuration = 30;

function asOptionalNumber(value: unknown): number | undefined {
  if (value == null || value === '') return undefined;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function normalizeEntry(entry: unknown): FoodEntry | null {
  if (!entry || typeof entry !== 'object') return null;
  const row = entry as Record<string, unknown>;
  const text = String(row.text || row.food_name || '').trim();
  if (!text) return null;
  return {
    text,
    brand: row.brand ? String(row.brand) : undefined,
    food_name: row.food_name ? String(row.food_name) : undefined,
    quantity: row.quantity ? String(row.quantity) : undefined,
    is_drink: Boolean(row.is_drink),
    calories: asOptionalNumber(row.calories),
    carbs: asOptionalNumber(row.carbs),
    fat: asOptionalNumber(row.fat),
    protein: asOptionalNumber(row.protein),
    fiber: asOptionalNumber(row.fiber),
    sugar: asOptionalNumber(row.sugar),
    needs_review: Boolean(row.needs_review),
    ocr_confidence: asOptionalNumber(row.ocr_confidence),
  };
}

function normalizeClientResult(raw: unknown): ExtractionResult {
  if (!raw || typeof raw !== 'object') {
    return emptyExtraction('', 0);
  }
  const body = raw as Record<string, unknown>;
  const slots = ['breakfast', 'lunch', 'dinner', 'snacks', 'drinks'] as const;
  const result = emptyExtraction(String(body.raw_ocr_text || ''), Number(body.confidence) || 0);
  for (const slot of slots) {
    const list = Array.isArray(body[slot]) ? body[slot] : [];
    result[slot] = list.map(normalizeEntry).filter((item): item is FoodEntry => Boolean(item));
  }
  if (typeof body.extracted_date === 'string' && body.extracted_date) {
    result.extracted_date = body.extracted_date;
  }
  result.model = typeof body.model === 'string' && body.model ? body.model : TESSERACT_MODEL_VERSION;
  return result;
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
    const { imageId, dailyEntryId, result } = body as {
      imageId?: string;
      dailyEntryId?: string;
      result?: unknown;
    };

    if (!dailyEntryId) {
      return NextResponse.json(
        { error: 'Missing required fields', code: 'extract', detail: 'dailyEntryId is required' },
        { status: 400 }
      );
    }

    if (!result || typeof result !== 'object') {
      return NextResponse.json(
        {
          error: 'Missing parsed extraction',
          code: 'extract',
          detail: 'Client-side OCR result is required; Gemini is not used for extraction',
        },
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

    const extractionResult = normalizeClientResult(result);

    const extraction = await prisma.ocrExtraction.create({
      data: {
        dailyEntryId,
        imageId: imageId || null,
        rawOcrText: extractionResult.raw_ocr_text,
        extractedData: JSON.stringify(extractionResult),
        extractedDate: extractionResult.extracted_date
          ? new Date(extractionResult.extracted_date)
          : null,
        modelName: 'tesseract.js',
        modelVersion: extractionResult.model || TESSERACT_MODEL_VERSION,
        confidenceScore: extractionResult.confidence,
      },
    });

    console.log(`[extract] saved on-device OCR model=${extraction.modelVersion}`);
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
