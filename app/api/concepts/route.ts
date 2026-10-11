// List food concepts with usage counts

import { NextResponse } from 'next/server';
import { getAuthorizedSession } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function GET() {
  const session = await getAuthorizedSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const concepts = await prisma.foodConcept.findMany({
    where: { isActive: true, mergedIntoId: null },
    include: {
      _count: { select: { foodItemConcepts: true } },
    },
    orderBy: { name: 'asc' },
  });

  return NextResponse.json({
    concepts: concepts.map((c) => ({
      id: c.id,
      name: c.name,
      itemCount: c._count.foodItemConcepts,
    })),
  });
}
