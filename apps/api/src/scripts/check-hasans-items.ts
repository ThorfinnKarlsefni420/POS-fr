import { prisma } from '../lib/prisma.ts';

async function main() {
  const storeId = 'store_hasans';
  const count = await (prisma as any).item.count({ where: { storeId: storeId } });
  console.log(`Number of items for store ${storeId}: ${count}`);
  
  const items = await (prisma as any).item.findMany({ 
    where: { storeId: storeId },
    take: 5,
    select: { name: true, category: true, currentStock: true }
  });
  console.log('Sample items:', JSON.stringify(items, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await (prisma as any).$disconnect();
  });
