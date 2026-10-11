import { NextRequest, NextResponse } from 'next/server';
import { getAuthorizedSession } from '@/lib/auth';
import { parseCalendarDate } from '@/lib/dates';
import { createWeeklyReportForUser } from '@/lib/analysis/weekly-report';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const session = await getAuthorizedSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { startDate: startDateStr, endDate: endDateStr } = await request.json();
    const startDate = parseCalendarDate(String(startDateStr).slice(0, 10));
    const endDate = parseCalendarDate(String(endDateStr).slice(0, 10));

    const created = await createWeeklyReportForUser({
      userId: session.userId,
      startDate,
      endDate,
    });

    return NextResponse.json({
      reportId: created.report.id,
      report: {
        ...created.report,
        observedData: created.observed,
        geminiInterpretation: created.interpretation,
      },
    });
  } catch (error) {
    console.error('Report generation error:', error);
    return NextResponse.json(
      { error: 'Failed to generate report', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
