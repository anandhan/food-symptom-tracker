import { NextResponse } from 'next/server';
import { getAuthorizedSession } from '@/lib/auth';
import { generateContentWithFallback, resolveGeminiModel } from '@/lib/ai/gemini-model';
import { getDatabaseConnectionInfo, prisma } from '@/lib/db';

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
  const geminiModel = resolveGeminiModel(process.env.GEMINI_EXTRACTION_MODEL);

  let gemini: { ok: boolean; error?: string };
  if (!hasGeminiKey) {
    gemini = { ok: false, error: 'GEMINI_API_KEY is not set' };
  } else {
    try {
      await generateContentWithFallback({
        apiKey: process.env.GEMINI_API_KEY as string,
        model: geminiModel,
        contents: 'Reply with the single word ok',
      });
      gemini = { ok: true };
    } catch (error) {
      gemini = {
        ok: false,
        error: error instanceof Error ? error.message : 'Gemini check failed',
      };
    }
  }

  return NextResponse.json({
    hasDatabaseUrl,
    hasBlobToken,
    hasGeminiKey,
    geminiModel,
    gemini,
    db,
  });
}
