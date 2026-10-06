// Daily entry page - main data input screen

import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { MainNav } from '@/components/main-nav';
import { EntryForm } from '@/components/entry/entry-form';
import { formatDateISO, parseDate } from '@/lib/utils';

export default async function EntryPage({
  searchParams,
}: {
  searchParams: { date?: string };
}) {
  const session = await getServerSession(authOptions);

  if (!session?.userId) {
    redirect('/login');
  }

  // Get date from query param or default to today
  const selectedDate = searchParams.date
    ? parseDate(searchParams.date)
    : new Date();
  selectedDate.setHours(0, 0, 0, 0);

  // Fetch existing entry for this date
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
    },
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50">
      <MainNav />
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
