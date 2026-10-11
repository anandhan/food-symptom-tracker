// Per-food detail page showing history and symptoms

import { redirect } from 'next/navigation';
import { getAuthorizedSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';
import { prisma } from '@/lib/db';
import { MainNav } from '@/components/main-nav';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';
import { addCalendarDays, formatCalendarDate, formatCalendarDateLong } from '@/lib/dates';

export default async function FoodDetailPage({
  searchParams,
}: {
  searchParams: Promise<{ food?: string }> | { food?: string };
}) {
  const session = await getAuthorizedSession();

  if (!session) {
    redirect('/login');
  }

  const params = await Promise.resolve(searchParams);
  const foodName = params.food || '';
  if (!foodName) {
    redirect('/history');
  }

  // Find all entries with this food
  const entries = await prisma.dailyEntry.findMany({
    where: {
      userId: session.userId,
      meals: {
        some: {
          foodItems: {
            some: {
              rawText: {
                contains: foodName,
                mode: 'insensitive',
              },
            },
          },
        },
      },
    },
    include: {
      meals: {
        include: {
          foodItems: true,
        },
      },
      symptomRecord: true,
    },
    orderBy: { date: 'desc' },
  });

  // Calculate stats
  const totalOccurrences = entries.length;
  const daysWithSymptoms = entries.filter(
    (e) =>
      e.symptomRecord?.overallRating === 'bad' ||
      e.symptomRecord?.overallRating === 'very_bad'
  ).length;
  const symptomRate = totalOccurrences > 0 ? (daysWithSymptoms / totalOccurrences) * 100 : 0;

  // Next-day symptoms
  const entriesWithDates = entries.map((e) => ({
    ...e,
    dateStr: formatCalendarDate(e.date),
  }));

  const allEntries = await prisma.dailyEntry.findMany({
    where: { userId: session.userId },
    include: { symptomRecord: true },
    orderBy: { date: 'asc' },
  });

  const allEntriesMap = new Map(
    allEntries.map((e) => [formatCalendarDate(e.date), e])
  );

  let nextDaySymptoms = 0;
  entriesWithDates.forEach((entry) => {
    const nextDayKey = addCalendarDays(entry.dateStr, 1);
    const nextEntry = allEntriesMap.get(nextDayKey);
    if (
      nextEntry?.symptomRecord?.overallRating === 'bad' ||
      nextEntry?.symptomRecord?.overallRating === 'very_bad'
    ) {
      nextDaySymptoms++;
    }
  });

  const nextDayRate = totalOccurrences > 0 ? (nextDaySymptoms / totalOccurrences) * 100 : 0;

  // Days without this food
  const totalDays = allEntries.length;
  const daysWithoutFood = totalDays - totalOccurrences;
  const symptomsWithoutFood = allEntries.filter(
    (e) =>
      (e.symptomRecord?.overallRating === 'bad' ||
        e.symptomRecord?.overallRating === 'very_bad') &&
      !entriesWithDates.find((entry) => entry.id === e.id)
  ).length;
  const symptomRateWithoutFood =
    daysWithoutFood > 0 ? (symptomsWithoutFood / daysWithoutFood) * 100 : 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50">
      <MainNav />
      <main className="container mx-auto px-4 py-8 max-w-6xl">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-2 capitalize">{foodName}</h1>
            <p className="text-muted-foreground">Complete history and symptom correlation</p>
          </div>
          <Link href="/history">
            <button className="px-4 py-2 border rounded-md hover:bg-gray-50">
              ← Back to History
            </button>
          </Link>
        </div>

        <div className="grid gap-6 md:grid-cols-3 mb-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl">{totalOccurrences}</CardTitle>
              <CardDescription>Times Eaten</CardDescription>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-2xl">{symptomRate.toFixed(0)}%</CardTitle>
              <CardDescription>Same-Day Symptom Rate</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                {daysWithSymptoms} out of {totalOccurrences} days
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-2xl">{nextDayRate.toFixed(0)}%</CardTitle>
              <CardDescription>Next-Day Symptom Rate</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                {nextDaySymptoms} out of {totalOccurrences} days
              </p>
            </CardContent>
          </Card>
        </div>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Comparison</CardTitle>
            <CardDescription>Symptoms with vs without this food</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm">With {foodName}:</span>
                <span className="text-sm font-bold">{symptomRate.toFixed(0)}% symptom rate</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm">Without {foodName}:</span>
                <span className="text-sm font-bold">
                  {symptomRateWithoutFood.toFixed(0)}% symptom rate
                </span>
              </div>
              <div className="pt-2 border-t">
                <p className="text-sm text-muted-foreground">
                  {symptomRate > symptomRateWithoutFood * 1.5
                    ? `⚠️ Symptoms are ${(symptomRate / (symptomRateWithoutFood || 1)).toFixed(1)}x more likely on days with ${foodName}`
                    : symptomRate < symptomRateWithoutFood * 0.8
                      ? `✅ ${foodName} appears well tolerated`
                      : '😐 No clear pattern'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>History ({totalOccurrences} entries)</CardTitle>
            <CardDescription>All days you ate {foodName}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {entries.map((entry) => (
                <div key={entry.id} className="p-3 border rounded-lg">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <p className="font-medium">
                        {formatCalendarDateLong(entry.date)}
                      </p>
                      <p className="text-sm text-muted-foreground mt-1">
                        {entry.symptomRecord?.overallRating
                          ? `Feeling: ${entry.symptomRecord.overallRating.replace('_', ' ')}`
                          : 'No rating'}
                      </p>
                      {entry.symptomRecord?.freeTextNotes && (
                        <p className="text-sm text-muted-foreground mt-1">
                          {entry.symptomRecord.freeTextNotes}
                        </p>
                      )}
                    </div>
                    <Link href={`/entry?date=${formatCalendarDate(entry.date)}`}>
                      <button className="text-sm px-3 py-1 border rounded hover:bg-gray-50">
                        View
                      </button>
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
