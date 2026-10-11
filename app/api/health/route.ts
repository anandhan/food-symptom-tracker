import { NextResponse } from 'next/server';
import { getAuthorizedSession } from '@/lib/auth';
import { resolveGeminiAnalysisModel } from '@/lib/ai/gemini-model';
import { getDatabaseConnectionInfo, prisma } from '@/lib/db';
import { TESSERACT_MODEL_VERSION } from '@/lib/ocr/assets';

export const maxDuration = 30;

export async function GET() {
  const session = await getAuthorizedSession();
  if (!session) {
    return NextResponse.json(
      { error: 'Unauthorized', code: 'extract', detail: 'Not signed in' },
      { status: 401 }
    );
  }

  const hasDatabaseUrl = Boolean(process.env.DATABASE_URL || process.env.POSTGRES_PRISMA_URL);
  const dbInfo = getDatabaseConnectionInfo();
  let db: { ok: boolean; latencyMs: number; error?: string } & typeof dbInfo;
  const dbStarted = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    db = { ok: true, latencyMs: Date.now() - dbStarted, ...dbInfo };
  } catch (error) {
    db = {
      ok: false,
      latencyMs: Date.now() - dbStarted,
      error: error instanceof Error ? error.message : 'Database ping failed',
      ...dbInfo,
    };
  }
  const hasBlobToken = Boolean(process.env.BLOB_READ_WRITE_TOKEN);
  const hasGeminiKey = Boolean(process.env.GEMINI_API_KEY);
  const geminiModel = resolveGeminiAnalysisModel(process.env.GEMINI_ANALYSIS_MODEL);

  return NextResponse.json({
    hasDatabaseUrl,
    hasBlobToken,
    hasGeminiKey,
    geminiModel,
    extraction: {
      provider: 'tesseract.js',
      onDevice: true,
      model: TESSERACT_MODEL_VERSION,
    },
    gemini: hasGeminiKey
      ? { ok: true, configured: true, purpose: 'analysis' }
      : { ok: false, configured: false, purpose: 'analysis', error: 'GEMINI_API_KEY is not set' },
    db,
  });
}
