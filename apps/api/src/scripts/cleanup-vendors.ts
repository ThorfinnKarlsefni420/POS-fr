import { prisma } from '../lib/prisma.ts';

async function main() {
  const storeId = 'store_hasans';
  
  // Find all vendors in the store
  const vendors = await (prisma as any).vendor.findMany({
    where: { storeId: storeId },
    select: { id: true, name: true }
  });

  console.log('Vendors:', JSON.stringify(vendors, null, 2));

  // If there's more than one vendor, delete the test ones (assuming names contain "test" or similar)
  if (vendors.length > 1) {
    const testVendors = vendors.filter((v: any) => v.name.toLowerCase().includes('test'));
    console.log('Deleting test vendors:', JSON.stringify(testVendors, null, 2));
    
    await (prisma as any).vendor.deleteMany({
      where: { id: { in: testVendors.map((v: any) => v.id) } }
    });
    console.log('Test vendors deleted.');
  } else {
    console.log('Only one vendor found, no deletion needed.');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await (prisma as any).$disconnect();
  });
