import { readFileSync } from 'fs';
import { join } from 'path';
import Papa from 'papaparse';
import { prisma } from '../lib/prisma.ts';

// Source: gogaq3.csv — a Q3 sales-ranking report (Cluster/Rank/Code/Description/
// Micro dept/Qty/Sales), not a price list. Only the top 10,000 ranked rows are
// imported (clusters below); the ~31k-row 'Rest' long-tail is intentionally
// skipped per user decision. Prices are left at 0 — to be filled in later via
// the Inventory UI or POST /api/superadmin/recalculate-prices once costPrice is set.
const CSV_PATH = join(process.cwd(), '../../gogaq3.csv');
const INCLUDED_CLUSTERS = new Set(['0 - 1000', '1001 - 5000', '5001 - 10000']);

const STORE_NAME = 'Goga';
const STORE_SLUG = 'goga';

interface Row {
  Cluster: string;
  Rank: string;
  Code: string;
  Description: string;
  'Micro dept': string;
  Qty: string;
  Sales: string;
}

async function main() {
  const raw = readFileSync(CSV_PATH, 'utf-8');
  const parsed = Papa.parse<Row>(raw, { header: true, skipEmptyLines: true });
  if (parsed.errors.length > 0) {
    console.warn(`CSV parse warnings: ${parsed.errors.length} (showing first 3)`);
    parsed.errors.slice(0, 3).forEach((e) => console.warn(e));
  }

  const rows = parsed.data.filter((r) => INCLUDED_CLUSTERS.has(r.Cluster?.trim()));
  console.log(`Parsed ${parsed.data.length} total rows, ${rows.length} in scope (top 10,000 clusters).`);

  let store = await prisma.store.findUnique({ where: { slug: STORE_SLUG } });
  if (store) {
    console.log('Store already exists:', store.id);
  } else {
    store = await prisma.store.create({ data: { name: STORE_NAME, slug: STORE_SLUG } });
    console.log('Store created:', store.id);
  }

  let admin = await prisma.user.findFirst({ where: { storeId: store.id, role: 'ADMIN' } });
  if (admin) {
    console.log('Admin already exists:', admin.id);
  } else {
    admin = await prisma.user.create({
      data: { name: `${STORE_NAME} Admin`, pin: '1234', role: 'ADMIN', storeId: store.id },
      select: { id: true, name: true, role: true, storeId: true } as any,
    }) as any;
    console.log('Admin user created:', admin.id, '(PIN: 1234)');
  }

  const items = rows.map((r) => ({
    storeId: store.id,
    name: r.Description?.trim() || r.Code.trim(),
    sku: r.Code.trim(),
    subCategory: (r['Micro dept'] ?? '').trim(),
    costPrice: 0,
    sellingPrice: 0,
    nomadBitePrice: 0,
  }));

  const BATCH = 1000;
  let inserted = 0;
  for (let i = 0; i < items.length; i += BATCH) {
    const batch = items.slice(i, i + BATCH);
    const result = await prisma.item.createMany({ data: batch, skipDuplicates: true });
    inserted += result.count;
    process.stdout.write(`\r  ${Math.min(i + BATCH, items.length)}/${items.length} processed, ${inserted} inserted`);
  }

  console.log(`\nDone — ${inserted} items inserted into "${STORE_NAME}" (${store.id}).`);
  console.log('All costPrice/sellingPrice/nomadBitePrice are 0 — fill in via Inventory UI, then run');
  console.log('POST /api/superadmin/recalculate-prices to set nomadBitePrice from costPrice.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
