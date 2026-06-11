import { prisma } from '../lib/prisma';
import { Prisma } from '@prisma/client';

async function cleanup(storeId: string) {
  console.log('Cleaning up store:', storeId);
  
  // Need to be careful with deletion order due to foreign keys.
  
  // 1. Transactions and their dependents
  const transactions = await prisma.transaction.findMany({ where: { storeId }, select: { id: true } });
  const txIds = transactions.map(t => t.id);
  
  await prisma.transactionPayment.deleteMany({ where: { transactionId: { in: txIds } } });
  await prisma.lineItem.deleteMany({ where: { transactionId: { in: txIds } } });
  await prisma.creditSale.deleteMany({ where: { transactionId: { in: txIds } } });
  await prisma.mkopoSale.deleteMany({ where: { transactionId: { in: txIds } } });
  await prisma.transaction.deleteMany({ where: { id: { in: txIds } } });
  
  // 2. Shifts
  const shifts = await prisma.shift.findMany({ where: { storeId }, select: { id: true } });
  const shiftIds = shifts.map(s => s.id);
  await prisma.cashLog.deleteMany({ where: { shiftId: { in: shiftIds } } });
  await prisma.shift.deleteMany({ where: { id: { in: shiftIds } } });
  
  // 3. Items and dependents
  const items = await prisma.item.findMany({ where: { storeId }, select: { id: true } });
  const itemIds = items.map(i => i.id);
  
  await prisma.packagingTier.deleteMany({ where: { itemId: { in: itemIds } } });
  await prisma.itemStock.deleteMany({ where: { itemId: { in: itemIds } } });
  await prisma.inventoryAdjustment.deleteMany({ where: { itemId: { in: itemIds } } });
  await prisma.item.deleteMany({ where: { id: { in: itemIds } } });
  
  // 4. Users, Vendors, Customers
  await prisma.user.deleteMany({ where: { storeId } });
  await prisma.vendor.deleteMany({ where: { storeId } });
  await prisma.customer.deleteMany({ where: { storeId } });
  
  // 5. Finally, StoreSetting, StockLocation, etc.
  await prisma.storeSetting.deleteMany({ where: { storeId } });
  await prisma.stockLocation.deleteMany({ where: { storeId } });
  
  console.log('Cleanup complete for store:', storeId);
}

const storeId = process.argv[2];
if (!storeId) {
  console.error('Missing storeId');
  process.exit(1);
}
cleanup(storeId).catch(console.error).finally(() => (prisma as any).());
