// Export all user data as JSON

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { buildExportPayload } from '@/lib/export';

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch all user data
    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: {
        id: true,
        email: true,
        username: true,
        name: true,
        createdAt: true,
      },
    });

    const entries = await prisma.dailyEntry.findMany({
      where: { userId: session.userId },
      include: {
        meals: {
          include: {
            foodItems: {
              include: {
                foodItemConcepts: {
                  include: {
                    foodConcept: true,
                  },
                },
              },
            },
          },
        },
        symptomRecord: {
          include: {
            symptomEvents: true,
          },
        },
        uploadedImages: true,
        ocrExtractions: true,
      },
      orderBy: { date: 'asc' },
    });

    const weeklyReports = await prisma.weeklyReport.findMany({
      where: { userId: session.userId },
      orderBy: { startDate: 'asc' },
    });

    const exportData = buildExportPayload({ user, entries, weeklyReports });

    return NextResponse.json(exportData, {
      headers: {
        'Content-Disposition': `attachment; filename="food-tracker-export-${Date.now()}.json"`,
        'Content-Type': 'application/json',
      },
    });
  } catch (error) {
    console.error('Export error:', error);
    return NextResponse.json(
      { error: 'Export failed', details: error instanceof Error ? error.message : 'Unknown' },
      { status: 500 }
    );
  }
}
