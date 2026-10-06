// Dashboard/Home page

import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { auth } from '@/lib/auth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { formatDateShort } from '@/lib/utils';
import { MainNav } from '@/components/main-nav';
import { LocalDateRedirect } from '@/components/local-date-redirect';
import { getDashboardStats } from '@/lib/dashboard-stats';
import {
  formatCalendarDate,
  getCalendarDateInTimezone,
  getConfiguredTimezone,
} from '@/lib/dates';

const RATING_EMOJI: Record<string, string> = {
  great: '😄',
  good: '🙂',
  okay: '😐',
  bad: '😞',
  very_bad: '😣',
};

export default async function HomePage({
  searchParams,
}: {
  searchParams: { date?: string };
}) {
  const session = await auth();

  if (!session?.userId) {
    redirect('/login');
  }

  const timezone = getConfiguredTimezone();
  const todayIso = searchParams.date || getCalendarDateInTimezone(new Date(), timezone);

  const stats = await getDashboardStats(session.userId, todayIso);
  const todayEntry = stats.todayEntry;
  const hasTodayEntry = todayEntry !== null;
  const hasMeals = Boolean(todayEntry?.meals && todayEntry.meals.length > 0);
  const hasSymptoms = todayEntry?.symptomRecord !== null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50">
      <MainNav />
      <Suspense fallback={null}>
        <LocalDateRedirect />
      </Suspense>

      <main className="container mx-auto px-4 py-8 max-w-6xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Dashboard</h1>
          <p className="text-muted-foreground">
            Welcome back. Dates use your local calendar day (cron uses {timezone}).
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 mb-8">
          <Card className="md:col-span-2 lg:col-span-3">
            <CardHeader>
              <CardTitle>Today&apos;s Entry</CardTitle>
              <CardDescription>
                Today {formatDateShort(todayIso)}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!hasTodayEntry ? (
                <div className="text-center py-8">
                  <p className="text-muted-foreground mb-4">
                    You haven&apos;t logged anything today yet.
                  </p>
                  <Link href={`/entry?date=${todayIso}`}>
                    <Button size="lg">Add Today&apos;s Entry</Button>
                  </Link>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Status</p>
                      <p className="text-lg font-medium">
                        {hasMeals && hasSymptoms ? 'Complete' : 'Incomplete'}
                      </p>
                    </div>
                    <Link href={`/entry?date=${todayIso}`}>
                      <Button variant="outline">
                        {hasMeals && hasSymptoms ? 'Edit Entry' : 'Complete Entry'}
                      </Button>
                    </Link>
                  </div>
                  {hasMeals && (
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">Meals logged</p>
                      <div className="flex gap-2 flex-wrap">
                        {todayEntry!.meals.map((meal) => (
                          <span
                            key={meal.id}
                            className="inline-flex items-center rounded-full bg-primary/10 px-3 py-1 text-sm"
                          >
                            {meal.mealType} ({meal.foodItems.length})
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {hasSymptoms && (
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">Overall feeling</p>
                      <p className="capitalize">{todayEntry!.symptomRecord?.overallRating || 'Not rated'}</p>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Total Days</CardTitle>
              <CardDescription>Days tracked</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{stats.totalDays}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Good Days</CardTitle>
              <CardDescription>Great or good</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-green-600">{stats.goodDays}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Bad Days</CardTitle>
              <CardDescription>Bad or very bad</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-red-600">{stats.badDays}</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-2 mb-8">
          <Card>
            <CardHeader>
              <CardTitle>Top Foods</CardTitle>
              <CardDescription>Most frequently logged</CardDescription>
            </CardHeader>
            <CardContent>
              {stats.topFoods.length === 0 ? (
                <p className="text-sm text-muted-foreground">No foods logged yet.</p>
              ) : (
                <ul className="space-y-2">
                  {stats.topFoods.map((item) => (
                    <li key={item.food} className="flex justify-between text-sm">
                      <Link href={`/food?food=${encodeURIComponent(item.food)}`} className="text-blue-700 hover:underline">
                        {item.food}
                      </Link>
                      <span className="text-muted-foreground">{item.count} days</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Foods Most Associated with Bad Days</CardTitle>
              <CardDescription>Appeared most often on bad / very bad days</CardDescription>
            </CardHeader>
            <CardContent>
              {stats.foodsOnBadDays.length === 0 ? (
                <p className="text-sm text-muted-foreground">Not enough bad-day data yet.</p>
              ) : (
                <ul className="space-y-2">
                  {stats.foodsOnBadDays.map((item) => (
                    <li key={item.food} className="flex justify-between text-sm">
                      <Link href={`/food?food=${encodeURIComponent(item.food)}`} className="text-blue-700 hover:underline">
                        {item.food}
                      </Link>
                      <span className="text-red-600">{item.count} bad days</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Foods Most Associated with Good Days</CardTitle>
              <CardDescription>Appeared most often on great / good days</CardDescription>
            </CardHeader>
            <CardContent>
              {stats.foodsOnGoodDays.length === 0 ? (
                <p className="text-sm text-muted-foreground">Not enough good-day data yet.</p>
              ) : (
                <ul className="space-y-2">
                  {stats.foodsOnGoodDays.map((item) => (
                    <li key={item.food} className="flex justify-between text-sm">
                      <Link href={`/food?food=${encodeURIComponent(item.food)}`} className="text-blue-700 hover:underline">
                        {item.food}
                      </Link>
                      <span className="text-green-600">{item.count} good days</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Symptom Trend</CardTitle>
              <CardDescription>Last 14 calendar days</CardDescription>
            </CardHeader>
            <CardContent>
              {stats.symptomTrend.length === 0 ? (
                <p className="text-sm text-muted-foreground">No recent ratings.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {stats.symptomTrend.map((point) => (
                    <div
                      key={point.date}
                      className="flex flex-col items-center rounded-md border bg-white px-2 py-1 text-xs"
                      title={point.rating || 'unrated'}
                    >
                      <span>{RATING_EMOJI[point.rating || ''] || '·'}</span>
                      <span className="text-muted-foreground">{point.date.slice(5)}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Latest Weekly Report</CardTitle>
            <CardDescription>
              {stats.latestReport
                ? `${stats.latestReport.startDate} – ${stats.latestReport.endDate}`
                : 'No report generated yet'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {stats.latestReport ? (
              <div className="space-y-3">
                <p className="text-sm">{stats.latestReport.summaryText}</p>
                <Link href="/reports">
                  <Button variant="outline" size="sm">Open reports</Button>
                </Link>
              </div>
            ) : (
              <Link href="/reports">
                <Button variant="outline">Generate a weekly report</Button>
              </Link>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Last 7 Days</CardTitle>
            <CardDescription>Recent activity</CardDescription>
          </CardHeader>
          <CardContent>
            {stats.recentEntries.length === 0 ? (
              <p className="text-muted-foreground text-center py-4">
                No entries yet. Start tracking today!
              </p>
            ) : (
              <div className="space-y-2">
                {stats.recentEntries.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-center justify-between p-3 rounded-lg border"
                  >
                    <div>
                      <p className="font-medium">{formatDateShort(entry.date)}</p>
                      {entry.symptomRecord && (
                        <p className="text-sm text-muted-foreground capitalize">
                          {entry.symptomRecord.overallRating}
                        </p>
                      )}
                    </div>
                    <Link href={`/entry?date=${formatCalendarDate(entry.date)}`}>
                      <Button variant="ghost" size="sm">View</Button>
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
