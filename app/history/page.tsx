// History page - browse and search past entries

import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { MainNav } from '@/components/main-nav';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { formatDateShort } from '@/lib/utils';

export default async function HistoryPage() {
  const session = await auth();

  if (!session?.userId) {
    redirect('/login');
  }

  // Get all entries, most recent first
  const entries = await prisma.dailyEntry.findMany({
    where: { userId: session.userId },
    include: {
      meals: {
        include: {
          foodItems: true,
        },
      },
      symptomRecord: true,
    },
    orderBy: {
      date: 'desc',
    },
    take: 50, // Limit to last 50 entries for now
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50">
      <MainNav />
      <main className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">History</h1>
          <p className="text-muted-foreground">
            Browse and search your past entries
          </p>
        </div>

        {entries.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground mb-4">
                No entries yet. Start tracking today!
              </p>
              <Link href="/entry">
                <Button>Add First Entry</Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {entries.map((entry) => {
              const foodCount = entry.meals.reduce(
                (sum, meal) => sum + meal.foodItems.length,
                0
              );
              const ratingEmoji = entry.symptomRecord?.overallRating
                ? {
                    great: '😊',
                    good: '🙂',
                    okay: '😐',
                    bad: '☹️',
                    very_bad: '😣',
                  }[entry.symptomRecord.overallRating]
                : '—';

              return (
                <Card key={entry.id}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-lg">
                          {formatDateShort(entry.date)}
                        </CardTitle>
                        <CardDescription>
                          {foodCount} food items • {entry.meals.length} meals
                        </CardDescription>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-2xl">{ratingEmoji}</span>
                        <Link href={`/entry?date=${entry.date.toISOString().split('T')[0]}`}>
                          <Button variant="outline" size="sm">View/Edit</Button>
                        </Link>
                      </div>
                    </div>
                  </CardHeader>
                  {entry.symptomRecord?.freeTextNotes && (
                    <CardContent>
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {entry.symptomRecord.freeTextNotes}
                      </p>
                    </CardContent>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
