import { prisma } from '@/lib/db';
import { buildObservedAnalysisSnapshot } from './observed-snapshot';
import {
  createAiInterpretation,
  toPublicInterpretation,
} from './gemini-interpretation';

function observedSummary(snapshot: Awaited<ReturnType<typeof buildObservedAnalysisSnapshot>>): string {
  const tone = snapshot.ratings.goodDays > snapshot.ratings.badDays ? 'Mostly positive' : 'Mixed';
  return `${tone} week ${snapshot.range.start}–${snapshot.range.end}: ${snapshot.ratings.goodDays} good days, ${snapshot.ratings.badDays} bad days, ${snapshot.range.daysTracked} days tracked.`;
}

export async function createWeeklyReportForUser(options: {
  userId: string;
  startDate: Date;
  endDate: Date;
}) {
  const snapshot = await buildObservedAnalysisSnapshot(options);
  const report = await prisma.weeklyReport.create({
    data: {
      userId: options.userId,
      startDate: options.startDate,
      endDate: options.endDate,
      summaryText: observedSummary(snapshot),
      observedData: JSON.stringify(snapshot),
      aiInterpretation: JSON.stringify({ pending: true }),
      modelName: 'pending',
      modelVersion: snapshot.promptVersion,
    },
  });

  const interpretation = await createAiInterpretation({
    userId: options.userId,
    kind: 'weekly_report',
    weeklyReportId: report.id,
    snapshot,
  });

  const updated = await prisma.weeklyReport.update({
    where: { id: report.id },
    data: {
      aiInterpretation: JSON.stringify(interpretation.output || { error: interpretation.error }),
      modelName: interpretation.modelId,
      modelVersion: interpretation.promptVersion,
    },
  });

  return {
    report: updated,
    observed: snapshot,
    interpretation: toPublicInterpretation(interpretation),
  };
}
