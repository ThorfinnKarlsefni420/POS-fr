import { readFileSync } from 'fs';
import { join } from 'path';
import Papa from 'papaparse';
import { prisma } from '../lib/prisma.ts';

// Backfills costPrice/sellingPrice for Goga items (imported at 0 by create-goga-store.ts)
// by matching against realData-import.csv on exact normalized product name.
// Only 6 of 9,790 Goga names match this way — the two lists use different naming
// conventions (realData names by pack multiplier, Goga by product line) — so this
// is intentionally strict, not fuzzy.
const REAL_DATA_PATH = join(process.cwd(), '../../realData-import.csv');
const STORE_SLUG = 'goga';

interface RealRow {
  'Correct Product Name': string;
  'Base Cost': string;
  'Base Sell': string;
}

function normalize(name: string): string {
  return name.trim().toUpperCase().replace(/\s+/g, ' ');
}

async function main() {
  const raw = readFileSync(REAL_DATA_PATH, 'utf-8');
  const parsed = Papa.parse<RealRow>(raw, { header: true, skipEmptyLines: true });

  const priceByName = new Map<string, { costPrice: number; sellingPrice: number }>();
  for (const row of parsed.data) {
    const name = row['Correct Product Name'];
    if (!name) continue;
    priceByName.set(normalize(name), {
      costPrice: Number(row['Base Cost']),
      sellingPrice: Number(row['Base Sell']),
    });
  }

  const store = await prisma.store.findUnique({ where: { slug: STORE_SLUG } });
  if (!store) throw new Error(`Store "${STORE_SLUG}" not found`);

  const settingRow = await prisma.systemSetting.findUnique({ where: { key: 'globalMarkupPercent' } });
  const markupPercent = settingRow ? Number(settingRow.value) : 16.5;

  const items = await prisma.item.findMany({ where: { storeId: store.id } });
  console.log(`${items.length} Goga items loaded, ${priceByName.size} priced products loaded from realData-import.csv.`);

  let updated = 0;
  for (const item of items) {
    const match = priceByName.get(normalize(item.name));
    if (!match) continue;

    const nomadBitePrice = Math.round(match.sellingPrice * (1 + markupPercent / 100) * 100) / 100;

    await prisma.item.update({
      where: { id: item.id },
      data: {
        costPrice: match.costPrice,
        sellingPrice: match.sellingPrice,
        nomadBitePrice,
      },
    });
    updated++;
    console.log(`  matched: "${item.name}" -> cost=${match.costPrice}, sell=${match.sellingPrice}, nomadBite=${nomadBitePrice}`);
  }

  console.log(`\nDone — ${updated} Goga items updated with prices from realData-import.csv.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
