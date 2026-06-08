import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const items = await prisma.item.findMany({
    where: {
      packagingTiers: {
        some: {
          isBaseUnit: false,
          level: { gt: 0 }
        }
      }
    },
    include: {
      packagingTiers: true
    },
    take: 5
  });

  console.log(JSON.stringify(items, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
