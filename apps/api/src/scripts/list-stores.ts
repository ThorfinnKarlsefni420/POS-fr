import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const stores = await prisma.store.findMany({
    select: { id: true, name: true, slug: true }
  });
  console.log(JSON.stringify(stores, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
