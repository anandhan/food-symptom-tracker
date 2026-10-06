// API endpoint to list weekly reports

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const reports = await prisma.weeklyReport.findMany({
      where: { userId: session.userId },
      orderBy: { generatedAt: 'desc' },
      take: 20,
    });

    // Parse JSON fields
    const formattedReports = reports.map((r) => ({
      ...r,
      observedData: typeof r.observedData === 'string' ? JSON.parse(r.observedData) : r.observedData,
      aiInterpretation: typeof r.aiInterpretation === 'string' ? JSON.parse(r.aiInterpretation) : r.aiInterpretation,
    }));

    return NextResponse.json({ reports: formattedReports });
  } catch (error) {
    console.error('List reports error:', error);
    return NextResponse.json(
      { error: 'Failed to list reports' },
      { status: 500 }
    );
  }
}
