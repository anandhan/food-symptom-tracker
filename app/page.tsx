// Dashboard/Home page

import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { formatDateShort } from '@/lib/utils';
import { MainNav } from '@/components/main-nav';

export default async function HomePage() {
  const session = await auth();

  if (!session?.userId) {
    redirect('/login');
  }

  // Get today's entry
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const todayEntry = await prisma.dailyEntry.findFirst({
    where: {
      userId: session.userId,
      date: today,
    },
    include: {
      meals: {
        include: {
          foodItems: true,
        },
      },
      symptomRecord: true,
    },
  });

  // Get last 7 days entries
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const recentEntries = await prisma.dailyEntry.findMany({
    where: {
      userId: session.userId,
      date: {
        gte: sevenDaysAgo,
        lte: today,
      },
    },
    include: {
      symptomRecord: true,
    },
    orderBy: {
      date: 'desc',
    },
  });

  // Calculate stats
  const totalDays = await prisma.dailyEntry.count({
    where: { userId: session.userId },
  });

  const goodDays = await prisma.symptomRecord.count({
    where: {
      dailyEntry: {
        userId: session.userId,
      },
      overallRating: {
        in: ['great', 'good'],
      },
    },
  });

  const badDays = await prisma.symptomRecord.count({
    where: {
      dailyEntry: {
        userId: session.userId,
      },
      overallRating: {
        in: ['bad', 'very_bad'],
      },
    },
  });

  const hasTodayEntry = todayEntry !== null;
  const hasMeals = todayEntry?.meals && todayEntry.meals.length > 0;
  const hasSymptoms = todayEntry?.symptomRecord !== null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50">
      <MainNav />
      
      <main className="container mx-auto px-4 py-8 max-w-6xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Dashboard</h1>
          <p className="text-muted-foreground">
            Welcome back! Track today's meals and symptoms.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 mb-8">
          {/* Today's Status Card */}
          <Card className="md:col-span-2 lg:col-span-3">
            <CardHeader>
              <CardTitle>Today's Entry</CardTitle>
              <CardDescription>{formatDateShort(today)}</CardDescription>
            </CardHeader>
            <CardContent>
              {!hasTodayEntry ? (
                <div className="text-center py-8">
                  <p className="text-muted-foreground mb-4">
                    You haven't logged anything today yet.
                  </p>
                  <Link href="/entry">
                    <Button size="lg">Add Today's Entry</Button>
                  </Link>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Status</p>
                      <p className="text-lg font-medium">
                        {hasMeals && hasSymptoms ? '✅ Complete' : '⚠️ Incomplete'}
                      </p>
                    </div>
                    <Link href="/entry">
                      <Button variant="outline">
                        {hasMeals && hasSymptoms ? 'Edit Entry' : 'Complete Entry'}
                      </Button>
                    </Link>
                  </div>
                  {hasMeals && (
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">Meals logged</p>
                      <div className="flex gap-2 flex-wrap">
                        {todayEntry.meals.map((meal) => (
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
                      <p className="capitalize">{todayEntry.symptomRecord?.overallRating || 'Not rated'}</p>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Quick Stats */}
          <Card>
            <CardHeader>
              <CardTitle>Total Days</CardTitle>
              <CardDescription>Days tracked</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{totalDays}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Good Days</CardTitle>
              <CardDescription>Great or good</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-green-600">{goodDays}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Bad Days</CardTitle>
              <CardDescription>Bad or very bad</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold text-red-600">{badDays}</p>
            </CardContent>
          </Card>
        </div>

        {/* Last 7 Days */}
        <Card>
          <CardHeader>
            <CardTitle>Last 7 Days</CardTitle>
            <CardDescription>Recent activity overview</CardDescription>
          </CardHeader>
          <CardContent>
            {recentEntries.length === 0 ? (
              <p className="text-muted-foreground text-center py-4">
                No entries yet. Start tracking today!
              </p>
            ) : (
              <div className="space-y-2">
                {recentEntries.map((entry) => (
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
                    <Link href={`/entry?date=${entry.date.toISOString().split('T')[0]}`}>
                      <Button variant="ghost" size="sm">View</Button>
                    </Link>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Link href="/history">
            <Button variant="outline" className="w-full h-20">
              <div className="text-center">
                <p className="font-semibold">History</p>
                <p className="text-xs text-muted-foreground">Browse past entries</p>
              </div>
            </Button>
          </Link>
          <Link href="/analysis">
            <Button variant="outline" className="w-full h-20">
              <div className="text-center">
                <p className="font-semibold">Analysis</p>
                <p className="text-xs text-muted-foreground">Food-symptom patterns</p>
              </div>
            </Button>
          </Link>
          <Link href="/reports">
            <Button variant="outline" className="w-full h-20">
              <div className="text-center">
                <p className="font-semibold">Weekly Reports</p>
                <p className="text-xs text-muted-foreground">View summaries</p>
              </div>
            </Button>
          </Link>
          <Link href="/settings">
            <Button variant="outline" className="w-full h-20">
              <div className="text-center">
                <p className="font-semibold">Settings</p>
                <p className="text-xs text-muted-foreground">Export & configure</p>
              </div>
            </Button>
          </Link>
        </div>
      </main>
    </div>
  );
}
