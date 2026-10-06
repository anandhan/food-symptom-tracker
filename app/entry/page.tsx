// Daily entry page - main data input screen

import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { MainNav } from '@/components/main-nav';
import { EntryForm } from '@/components/entry/entry-form';
import { LocalDateRedirect } from '@/components/local-date-redirect';
import { parseDate } from '@/lib/utils';
import { getCalendarDateInTimezone, getConfiguredTimezone } from '@/lib/dates';

export default async function EntryPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }> | { date?: string };
}) {
  const session = await auth();

  if (!session?.userId) {
    redirect('/login');
  }

  const params = await Promise.resolve(searchParams);
  const fallback = getCalendarDateInTimezone(new Date(), getConfiguredTimezone());
  const selectedDate = parseDate(params.date || fallback);

  const existingEntry = await prisma.dailyEntry.findFirst({
    where: {
      userId: session.userId,
      date: selectedDate,
    },
    include: {
      meals: {
        include: {
          foodItems: {
            orderBy: {
              orderIndex: 'asc',
            },
          },
        },
        orderBy: {
          createdAt: 'asc',
        },
      },
      symptomRecord: true,
      uploadedImages: {
        orderBy: {
          uploadedAt: 'desc',
        },
      },
      ocrExtractions: {
        orderBy: {
          extractedAt: 'desc',
        },
      },
    },
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50">
      <MainNav />
      <Suspense fallback={null}>
        <LocalDateRedirect />
      </Suspense>
      <main className="container mx-auto px-4 py-8 max-w-4xl">
        <EntryForm
          userId={session.userId}
          selectedDate={selectedDate}
          existingEntry={existingEntry}
        />
      </main>
    </div>
  );
}
