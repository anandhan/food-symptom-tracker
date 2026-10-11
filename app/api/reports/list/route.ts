import { NextResponse } from 'next/server';
import { getAuthorizedSession } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function GET() {
  try {
    const session = await getAuthorizedSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const reports = await prisma.weeklyReport.findMany({
      where: { userId: session.userId },
      orderBy: { generatedAt: 'desc' },
      take: 20,
      include: {
        aiInterpretations: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    const formattedReports = reports.map((r) => {
      const latest = r.aiInterpretations[0];
      return {
        ...r,
        observedData: typeof r.observedData === 'string' ? JSON.parse(r.observedData) : r.observedData,
        aiInterpretation: typeof r.aiInterpretation === 'string' ? JSON.parse(r.aiInterpretation) : r.aiInterpretation,
        geminiInterpretation: latest
          ? {
              id: latest.id,
              modelId: latest.modelId,
              promptVersion: latest.promptVersion,
              inputSnapshotHash: latest.inputSnapshotHash,
              createdAt: latest.createdAt,
              output: latest.outputJson ? JSON.parse(latest.outputJson) : null,
              error: latest.error,
            }
          : null,
      };
    });

    return NextResponse.json({ reports: formattedReports });
  } catch (error) {
    console.error('List reports error:', error);
    return NextResponse.json(
      { error: 'Failed to list reports' },
      { status: 500 }
    );
  }
}
