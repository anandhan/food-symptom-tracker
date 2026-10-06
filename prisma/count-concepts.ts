import { prisma } from '../lib/db';

async function main() {
  const [concepts, links, items] = await Promise.all([
    prisma.foodConcept.count(),
    prisma.foodItemConcept.count(),
    prisma.foodItem.count(),
  ]);
  const named = await prisma.foodConcept.findMany({
    select: { name: true, _count: { select: { foodItemConcepts: true } } },
    orderBy: { name: 'asc' },
  });
  console.log(`concepts=${concepts} links=${links} items=${items}`);
  for (const c of named) {
    console.log(`  ${c.name}: ${c._count.foodItemConcepts}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
