import { parseLungaLunga } from './parse-lungalunga.ts';
import { join } from 'path';
import { prisma } from '../lib/prisma.ts';

const STORE_ID = 'store_hasans';

function uid(): string {
  return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

// Simple heuristic categorization
function categorize(name: string): string {
  const n = name.toUpperCase();
  if (n.includes('CERELAC') || n.includes('NAN') || n.includes('BABY')) return 'Baby Products';
  if (n.includes('MILK') || n.includes('BARIRA')) return 'Dairy';
  if (n.includes('UGALI') || n.includes('ATTA') || n.includes('NGANO')) return 'Flour & Grains';
  if (n.includes('TISSUE') || n.includes('TOILET') || n.includes('SOAP') || n.includes('DISHWASH')) return 'Cleaning & Toiletries';
  if (n.includes('JUICE') || n.includes('COLA') || n.includes('MILO')) return 'Beverages';
  if (n.includes('CHOCO') || n.includes('BISCUIT')) return 'Snacks';
  return 'General';
}

async function main() {
  const filePath = join('/home/user/POS-fr/lungalunga.txt');
  console.log(`Parsing ${filePath}...`);
  const rows = parseLungaLunga(filePath);
  
  // Group by item
  const groups = new Map<string, any[]>();
  for (const row of rows) {
    if (!groups.has(row.itemId)) groups.set(row.itemId, []);
    groups.get(row.itemId)!.push(row);
  }

  // Clear old data
  console.log('Clearing old data...');
  await (prisma as any).inventoryAdjustment.deleteMany({ where: { item: { storeId: STORE_ID } } });
  await (prisma as any).lineItem.deleteMany({ where: { item: { storeId: STORE_ID } } });
  await (prisma as any).stockTransfer.deleteMany({ where: { item: { storeId: STORE_ID } } });
  await (prisma as any).itemStock.deleteMany({ where: { item: { storeId: STORE_ID } } });
  await (prisma as any).packagingTier.deleteMany({ where: { item: { storeId: STORE_ID } } });
  await (prisma as any).item.deleteMany({ where: { storeId: STORE_ID } });

  // Pre-fetch VAT classes
  const vatClasses = await (prisma as any).vatClass.findMany();
  const standardVat = vatClasses.find((v: any) => v.code === 'STANDARD')?.id;
  const zeroVat = vatClasses.find((v: any) => v.code === 'ZERO')?.id;

  console.log('Importing with randomized stock and categorization...');

  for (const [itemId, itemRows] of groups.entries()) {
    const sorted = [...itemRows].sort((a, b) => a.ratio - b.ratio);
    const base = sorted[0];
    
    // Random stock between 5 and 100
    const randomStock = Math.floor(Math.random() * 95) + 5;
    
    await (prisma as any).item.create({
      data: {
        id: uid(),
        storeId: STORE_ID,
        name: base.description,
        sku: itemId,
        category: categorize(base.description),
        unit: base.uom,
        costPrice: base.cost,
        sellingPrice: base.price,
        nomadBitePrice: base.price,
        taxRate: base.vatPercent,
        vatClassId: base.vatPercent === 16 ? standardVat : zeroVat,
        currentStock: randomStock,
        barcode: base.barcode,
        packagingTiers: {
          create: sorted.map((r, idx) => ({
            name: r.uom,
            level: idx,
            quantityInBase: r.ratio,
            costPrice: r.cost,
            sellingPriceOverride: r.price,
            barcode: r.barcode,
            isBaseUnit: idx === 0,
          }))
        }
      },
    });
  }

  console.log('Import complete.');
}

main().catch(console.error).finally(() => (prisma as any).$disconnect());
