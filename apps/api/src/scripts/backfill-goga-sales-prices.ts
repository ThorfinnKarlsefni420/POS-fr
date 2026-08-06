import { readFileSync } from 'fs';
import { join } from 'path';
import Papa from 'papaparse';
import { prisma } from '../lib/prisma.ts';

// Backfills sellingPrice for Goga items still at 0 using the same gogaq3.csv
// that created them: Sales / Qty per row is the real average price customers
// paid for that item in Q3 (revenue divided by units sold), keyed by SKU
// (the "Code" column), which is unique per item. costPrice is left untouched
// (0) — Sales/Qty is Goga's realized retail price, not their buying cost —
// so nomadBitePrice cannot be derived from it yet.
const CSV_PATH = join(process.cwd(), '../../gogaq3.csv');
const STORE_SLUG = 'goga';

interface Row {
  Code: string;
  Qty: string;
  Sales: string;
}

async function main() {
  const raw = readFileSync(CSV_PATH, 'utf-8');
  const parsed = Papa.parse<Row>(raw, { header: true, skipEmptyLines: true });

  const priceBySku = new Map<string, number>();
  for (const row of parsed.data) {
    const sku = row.Code?.trim();
    const qty = Number(row.Qty);
    const sales = Number(row.Sales);
    if (!sku || !qty || !sales) continue;
    priceBySku.set(sku, Math.round((sales / qty) * 100) / 100);
  }

  const store = await prisma.store.findUnique({ where: { slug: STORE_SLUG } });
  if (!store) throw new Error(`Store "${STORE_SLUG}" not found`);

  const items = await prisma.item.findMany({
    where: { storeId: store.id, sellingPrice: 0 },
    select: { id: true, sku: true },
  });
  console.log(`${items.length} unpriced Goga items, ${priceBySku.size} SKUs with a computed price from gogaq3.csv.`);

  const rows = items
    .map((item) => ({ id: item.id, price: priceBySku.get(item.sku) }))
    .filter((r): r is { id: string; price: number } => r.price !== undefined);

  let updated = 0;
  const BATCH = 500;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const ids = batch.map((r) => r.id);
    const cases = batch.map((r) => `WHEN '${r.id}' THEN ${r.price}`).join(' ');
    const idList = ids.map((id) => `'${id}'`).join(',');
    const count = await prisma.$executeRawUnsafe(
      `UPDATE "Item" SET "sellingPrice" = CASE "id" ${cases} END WHERE "id" IN (${idList})`
    );
    updated += count;
    process.stdout.write(`\r  ${Math.min(i + BATCH, rows.length)}/${rows.length} processed, ${updated} updated`);
  }

  console.log(`\nDone — ${updated} Goga items given a sellingPrice from Q3 sales data.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
