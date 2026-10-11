import { NextRequest, NextResponse } from 'next/server';
import { getAuthorizedSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { buildObservedAnalysisSnapshot } from '@/lib/analysis/observed-snapshot';
import { createAiInterpretation, toPublicInterpretation } from '@/lib/analysis/gemini-interpretation';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const session = await getAuthorizedSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { reportId } = await request.json();
  if (!reportId || typeof reportId !== 'string') {
    return NextResponse.json({ error: 'reportId is required' }, { status: 400 });
  }

  const report = await prisma.weeklyReport.findUnique({ where: { id: reportId } });
  if (!report || report.userId !== session.userId) {
    return NextResponse.json({ error: 'Report not found' }, { status: 404 });
  }

  const snapshot = await buildObservedAnalysisSnapshot({
    userId: session.userId,
    startDate: report.startDate,
    endDate: report.endDate,
  });
  const interpretation = await createAiInterpretation({
    userId: session.userId,
    kind: 'weekly_report',
    weeklyReportId: report.id,
    snapshot,
  });

  await prisma.weeklyReport.update({
    where: { id: report.id },
    data: {
      aiInterpretation: JSON.stringify(interpretation.output || { error: interpretation.error }),
      modelName: interpretation.modelId,
      modelVersion: interpretation.promptVersion,
    },
  });

  return NextResponse.json({
    interpretation: toPublicInterpretation(interpretation),
  });
}
