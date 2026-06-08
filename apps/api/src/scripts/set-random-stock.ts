import { prisma } from '../lib/prisma.ts';

const STORE_ID = 'store_hasans';

async function main() {
  console.log(`Updating stock for store: ${STORE_ID}...`);
  
  const items = await (prisma as any).item.findMany({
    where: { storeId: STORE_ID },
    select: { id: true }
  });

  console.log(`Found ${items.length} items to update.`);

  let updated = 0;
  
  // Using a loop for individual updates to ensure we can log progress
  // and handle potential errors gracefully.
  for (const item of items) {
    const randomStock = Math.floor(Math.random() * 95) + 5;
    
    await (prisma as any).item.update({
      where: { id: item.id },
      data: { currentStock: randomStock }
    });

    updated++;
    if (updated % 200 === 0 || updated === items.length) {
      console.log(`Progress: ${updated}/${items.length} items updated.`);
    }
  }

  console.log('Stock randomization complete.');
}

main().catch(console.error).finally(() => (prisma as any).$disconnect());
