import { prisma } from '../lib/prisma.ts';

async function main() {
  // Update all items to have a default stock of 50
  const result = await (prisma as any).item.updateMany({
    data: {
      currentStock: 50
    }
  });
  
  console.log(`Updated ${result.count} items to be in stock.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await (prisma as any).$disconnect();
  });
