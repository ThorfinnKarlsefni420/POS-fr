import { prisma } from '../lib/prisma.ts';

async function main() {
  const vendors = await (prisma as any).vendor.findMany({
    select: { id: true, name: true, storeId: true }
  });
  console.log('Vendors:', JSON.stringify(vendors, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await (prisma as any).$disconnect();
  });
