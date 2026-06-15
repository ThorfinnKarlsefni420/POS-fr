/**
 * Set stock for the active admin store (Best wholesalers ltd):
 *   - Piece items  → currentStock = 30  (base units)
 *   - Bulk items   → currentStock = 20 × highest_tier.quantityInBase
 *
 * "Bulk" is determined by the highest packaging tier name matching a known
 * container word (CTN, OUT, BAL, BAG, JRC, DOZ, etc.).
 * Everything else (PCS, EA, KG, TM, …) is treated as a piece item.
 *
 * Usage:
 *   node --env-file=.env --import tsx/esm src/scripts/set-stock-by-type.ts [--dry-run]
 */
import { Pool } from 'pg';

const STORE_ID = 'cmq9udymy0000v9drlfnnj7ps'; // Best wholesalers ltd (Hassan — only active ADMIN)
const PIECE_QTY = 30;
const BULK_QTY  = 20;

const BULK_TIER_NAMES = new Set([
  'CTN', 'CARTON', 'OUT', 'OUTER', 'BAL', 'BALE',
  'BAG', 'JRC', 'JERRICAN', 'JERRY CAN', 'JERRY',
  'DOZ', 'DOZEN', 'BOX', 'BUNDLE', 'SACK', 'PACK',
  'CASE', 'CRATE',
]);

function isBulk(tierName: string): boolean {
  return BULK_TIER_NAMES.has(tierName.toUpperCase().trim());
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  if (dryRun) console.log('DRY RUN — no DB writes\n');

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  // Fetch all items with their highest packaging tier (by quantityInBase)
  const { rows: items } = await pool.query<{
    id: string;
    name: string;
    unit: string;
    currentStock: string;
    highestTierName: string | null;
    highestTierQty: string | null;
  }>(`
    SELECT
      i.id,
      i.name,
      i.unit,
      i."currentStock",
      pt.name        AS "highestTierName",
      pt."quantityInBase" AS "highestTierQty"
    FROM "Item" i
    LEFT JOIN LATERAL (
      SELECT name, "quantityInBase"
      FROM   "PackagingTier"
      WHERE  "itemId" = i.id
      ORDER  BY "quantityInBase" DESC
      LIMIT  1
    ) pt ON true
    WHERE i."storeId" = $1
    ORDER BY i.name
  `, [STORE_ID]);

  console.log(`Found ${items.length} items in store ${STORE_ID}\n`);

  let pieceCount = 0;
  let bulkCount  = 0;
  let updated    = 0;

  const updates: Array<{ id: string; newStock: number }> = [];

  for (const item of items) {
    // Use highest tier name if available, otherwise fall back to item unit
    const tierName = item.highestTierName ?? item.unit;
    const tierQty  = item.highestTierQty != null ? Number(item.highestTierQty) : 1;

    let newStock: number;

    if (isBulk(tierName)) {
      newStock = BULK_QTY * tierQty;
      bulkCount++;
    } else {
      newStock = PIECE_QTY;
      pieceCount++;
    }

    updates.push({ id: item.id, newStock });

    if (dryRun && updated < 30) {
      console.log(
        `  ${item.name.padEnd(45)} unit=${item.unit.padEnd(5)} ` +
        `highestTier=${String(tierName).padEnd(5)} ` +
        `(×${String(tierQty).padStart(4)}) → ` +
        `${isBulk(tierName) ? 'BULK ' : 'PIECE'} → stock=${newStock}`
      );
    }
    updated++;
  }

  if (dryRun) {
    if (items.length > 30) console.log(`  … and ${items.length - 30} more`);
    console.log(`\nSummary (dry run):`);
    console.log(`  Piece items: ${pieceCount}  →  stock = ${PIECE_QTY}`);
    console.log(`  Bulk items:  ${bulkCount}  →  stock = ${BULK_QTY} × highest tier qty`);
    console.log(`\nRe-run without --dry-run to apply.`);
    await pool.end();
    return;
  }

  // Batch update in chunks of 500
  const CHUNK = 500;
  for (let i = 0; i < updates.length; i += CHUNK) {
    const batch = updates.slice(i, i + CHUNK);

    // Build a VALUES list for bulk update
    const values: (string | number)[] = [];
    const rows = batch.map(({ id, newStock }, j) => {
      values.push(id, newStock);
      return `($${j * 2 + 1}, $${j * 2 + 2}::numeric)`;
    });

    await pool.query(`
      UPDATE "Item" AS i
      SET    "currentStock" = v.stock,
             "updatedAt"    = NOW()
      FROM   (VALUES ${rows.join(',')}) AS v(id, stock)
      WHERE  i.id = v.id
        AND  i."storeId" = '${STORE_ID}'
    `, values);

    process.stdout.write(`\r  Updated ${Math.min(i + CHUNK, updates.length)}/${updates.length}`);
  }

  console.log(`\n\nDone.`);
  console.log(`  Piece items: ${pieceCount}  →  stock = ${PIECE_QTY}`);
  console.log(`  Bulk items:  ${bulkCount}  →  stock = ${BULK_QTY} × highest tier qty`);

  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
