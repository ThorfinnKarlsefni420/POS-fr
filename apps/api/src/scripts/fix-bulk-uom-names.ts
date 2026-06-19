import { prisma } from '../lib/prisma.ts';

const STORE_ID = 'cmq9udymy0000v9drlfnnj7ps'; // Best Wholesalers Ltd
const BULK_UOMS = new Set(['CTN', 'OUT', 'BAL', 'DOZ', 'JRC', 'BAG', 'TM', 'HL', 'HLT']);

async function main() {
  // Fix PackagingTier names: bulk UOM with quantityInBase=1 → PCS
  const tiersToFix = await (prisma as any).packagingTier.findMany({
    where: {
      name: { in: Array.from(BULK_UOMS) },
      quantityInBase: 1,
      item: { storeId: STORE_ID },
    },
    include: { item: { select: { id: true, name: true } } },
  });

  console.log(`Found ${tiersToFix.length} packaging tier(s) to rename to PCS.`);

  let tierUpdated = 0;
  let tierSkipped = 0;

  for (const tier of tiersToFix) {
    // Check if a PCS tier already exists for this item (unique constraint guard)
    const existing = await (prisma as any).packagingTier.findUnique({
      where: { itemId_name: { itemId: tier.itemId, name: 'PCS' } },
    });

    if (existing) {
      console.warn(`  SKIP: ${tier.item.name} already has a PCS tier — not renaming ${tier.name}`);
      tierSkipped++;
      continue;
    }

    await (prisma as any).packagingTier.update({
      where: { id: tier.id },
      data: { name: 'PCS' },
    });
    console.log(`  Updated tier: ${tier.item.name} | ${tier.name} → PCS`);
    tierUpdated++;
  }

  // Fix Item.unit field for same items
  const itemsToFix = await (prisma as any).item.findMany({
    where: {
      storeId: STORE_ID,
      unit: { in: Array.from(BULK_UOMS) },
    },
    select: { id: true, name: true, unit: true },
  });

  console.log(`\nFound ${itemsToFix.length} item(s) with bulk UOM as base unit field.`);

  let itemUpdated = 0;
  for (const item of itemsToFix) {
    await (prisma as any).item.update({
      where: { id: item.id },
      data: { unit: 'PCS' },
    });
    console.log(`  Updated item unit: ${item.name} | ${item.unit} → PCS`);
    itemUpdated++;
  }

  console.log(`\nDone. Tiers updated: ${tierUpdated}, skipped: ${tierSkipped}. Items updated: ${itemUpdated}.`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
