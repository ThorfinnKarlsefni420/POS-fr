import { parseLungaLunga } from './parse-lungalunga.ts';
import { join } from 'path';
import { prisma } from '../lib/prisma.ts';

const STORE_ID = 'store_hasans'; // default store

function uid(): string {
  return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

async function main() {
  const filePath = join('/home/user/POS-fr/lungalunga.txt');
  console.log(`Parsing ${filePath}...`);
  const rows = parseLungaLunga(filePath);
  console.log(`Parsed ${rows.length} rows.`);

  // Ensure store exists
  const store = await (prisma as any).store.upsert({
    where: { id: STORE_ID },
    update: {},
    create: { id: STORE_ID, name: 'Hasan\'s Store', slug: 'hasans-store' },
  });
  console.log(`Using store: ${store.name} (${store.id})`);

  // Clear existing data for this store
  console.log('Clearing old data...');
  
  // Order matters for foreign keys
  await (prisma as any).inventoryAdjustment.deleteMany({ where: { item: { storeId: STORE_ID } } });
  await (prisma as any).lineItem.deleteMany({ where: { item: { storeId: STORE_ID } } });
  await (prisma as any).stockTransfer.deleteMany({ where: { item: { storeId: STORE_ID } } });
  await (prisma as any).itemStock.deleteMany({ where: { item: { storeId: STORE_ID } } });
  await (prisma as any).packagingTier.deleteMany({ where: { item: { storeId: STORE_ID } } });
  await (prisma as any).item.deleteMany({ where: { storeId: STORE_ID } });
  
  console.log('Old data cleared.');

  const groups = new Map<string, any[]>();
  for (const row of rows) {
    if (!groups.has(row.itemId)) groups.set(row.itemId, []);
    groups.get(row.itemId)!.push(row);
  }
  console.log(`Grouped into ${groups.size} items.`);

  let succeeded = 0;
  let failed = 0;

  // Pre-fetch VAT classes to avoid repeated queries
  const vatClasses = await (prisma as any).vatClass.findMany();
  const standardVat = vatClasses.find((v: any) => v.code === 'STANDARD')?.id;
  const zeroVat = vatClasses.find((v: any) => v.code === 'ZERO')?.id;

  const CHUNK_SIZE = 5;
  const itemEntries = Array.from(groups.entries());

  for (let i = 0; i < itemEntries.length; i += CHUNK_SIZE) {
    const chunk = itemEntries.slice(i, i + CHUNK_SIZE);
    
    await Promise.all(chunk.map(async ([itemId, itemRows]) => {
      try {
        const sorted = [...itemRows].sort((a, b) => a.ratio - b.ratio);
        const base = sorted[0];

        const vatClassId = base.vatPercent === 16 ? standardVat : zeroVat;

        // Create item
        const item = await (prisma as any).item.create({
          data: {
            id: uid(),
            storeId: STORE_ID,
            name: base.description,
            sku: itemId,
            category: 'General',
            unit: base.uom,
            costPrice: base.cost,
            sellingPrice: base.price,
            nomadBitePrice: base.price,
            taxRate: base.vatPercent,
            vatClassId,
            currentStock: base.openingBal,
            barcode: base.barcode,
            packagingTiers: {
              create: sorted.map((r, idx) => {
                // Ensure name is unique within this item
                let name = r.uom;
                const isDuplicateName = sorted.some((other, otherIdx) => otherIdx !== idx && other.uom === r.uom);
                if (isDuplicateName) {
                  name = `${r.uom} (${r.ratio})`;
                }
                
                return {
                  name,
                  level: idx,
                  quantityInBase: r.ratio,
                  costPrice: r.cost,
                  sellingPriceOverride: r.price,
                  barcode: r.barcode,
                  isBaseUnit: idx === 0,
                };
              })
            }
          },
        });

        succeeded++;
      } catch (e) {
        failed++;
        console.error(`Failed to import item ${itemId}:`, e);
      }
    }));

    if (succeeded % 100 === 0 || succeeded === groups.size) {
      console.log(`Progress: ${succeeded}/${groups.size} items imported.`);
    }
  }

  console.log(`Import complete. Succeeded: ${succeeded}, Failed: ${failed}`);
}

main()
  .catch(console.error)
  .finally(async () => {
    // Prisma connection might be closed by global handler
  });
