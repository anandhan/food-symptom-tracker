import { NextRequest, NextResponse } from 'next/server';
import { getAuthorizedSession } from '@/lib/auth';
import { addCalendarDays, getCalendarDateInTimezone, getConfiguredTimezone, parseCalendarDate } from '@/lib/dates';
import { buildObservedAnalysisSnapshot } from '@/lib/analysis/observed-snapshot';
import {
  createAiInterpretation,
  latestInterpretation,
  toPublicInterpretation,
} from '@/lib/analysis/gemini-interpretation';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

function rangeFromDays(daysBack: number) {
  const todayIso = getCalendarDateInTimezone(new Date(), getConfiguredTimezone());
  const endDate = parseCalendarDate(todayIso);
  const startDate = parseCalendarDate(addCalendarDays(todayIso, -(daysBack - 1)));
  return { startDate, endDate };
}

export async function GET(request: NextRequest) {
  const session = await getAuthorizedSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const daysBack = parseInt(request.nextUrl.searchParams.get('days') || '30', 10);
  const existing = await latestInterpretation({ userId: session.userId, kind: 'analysis' });
  return NextResponse.json({
    days: daysBack,
    interpretation: existing ? toPublicInterpretation(existing) : null,
  });
}

export async function POST(request: NextRequest) {
  const session = await getAuthorizedSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const daysBack = parseInt(String(body.days || '30'), 10);
  const { startDate, endDate } = rangeFromDays(Number.isFinite(daysBack) ? daysBack : 30);
  const snapshot = await buildObservedAnalysisSnapshot({
    userId: session.userId,
    startDate,
    endDate,
  });
  const interpretation = await createAiInterpretation({
    userId: session.userId,
    kind: 'analysis',
    snapshot,
  });

  return NextResponse.json({
    interpretation: toPublicInterpretation(interpretation),
  });
}
