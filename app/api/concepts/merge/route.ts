// Merge one food concept into another

import { NextRequest, NextResponse } from 'next/server';
import { getAuthorizedSession } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function POST(request: NextRequest) {
  const session = await getAuthorizedSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { fromId, intoId } = await request.json();
  if (!fromId || !intoId || fromId === intoId) {
    return NextResponse.json({ error: 'fromId and intoId are required' }, { status: 400 });
  }

  const [from, into] = await Promise.all([
    prisma.foodConcept.findUnique({ where: { id: fromId } }),
    prisma.foodConcept.findUnique({ where: { id: intoId } }),
  ]);
  if (!from || !into) {
    return NextResponse.json({ error: 'Concept not found' }, { status: 404 });
  }

  const links = await prisma.foodItemConcept.findMany({ where: { foodConceptId: fromId } });
  for (const link of links) {
    const exists = await prisma.foodItemConcept.findUnique({
      where: {
        foodItemId_foodConceptId: {
          foodItemId: link.foodItemId,
          foodConceptId: intoId,
        },
      },
    });
    if (exists) {
      await prisma.foodItemConcept.delete({ where: { id: link.id } });
    } else {
      await prisma.foodItemConcept.update({
        where: { id: link.id },
        data: { foodConceptId: intoId },
      });
    }
  }

  await prisma.foodConcept.update({
    where: { id: fromId },
    data: { mergedIntoId: intoId, isActive: false },
  });

  return NextResponse.json({ success: true });
}
