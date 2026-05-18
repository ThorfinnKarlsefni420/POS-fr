/**
 * Import vendor-filled vendor_catalogue_final.xlsx back into the POS.
 *
 * What it does per row:
 *  1. Upserts the base Item (matched by slugified DB name → sku prefix)
 *  2. Converts L1/L2 stock to base units and sets currentStock
 *  3. Replaces all PackagingTiers (full replace strategy)
 *  4. Computes qtyInBase: L1 = L1qty, L2 = L1qty × L2qty
 *
 * Usage:
 *   node --env-file=.env --import tsx/esm src/scripts/import-vendor-catalogue.ts \
 *     --file ../../vendor_catalogue_final.xlsx [--dry-run] [--category "X"]
 */
import { readFileSync } from 'fs';
import { join, resolve } from 'path';
import { Pool } from 'pg';
import * as XLSX from 'xlsx';
import { inferPackaging } from '../lib/packaging-inference.js';

const STORE_ID = 'store_hasans';

function uid() { return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
function n(v: unknown): number | null { const x = parseFloat(String(v ?? '')); return isNaN(x) ? null : x; }
function ni(v: unknown): number | null { const x = parseInt(String(v ?? '')); return isNaN(x) ? null : x; }
function slugify(s: string) {
  return s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
}

type Row = {
  dbName: string; category: string; correctName: string; brand: string; vat: number | null;
  baseUnit: string; baseCost: number | null; baseSell: number | null;
  baseStock: number | null; barcode: string;
  l1Name: string; l1Qty: number | null; l1Cost: number | null; l1Sell: number | null; l1Stock: number | null;
  l2Name: string; l2Qty: number | null; l2Cost: number | null; l2Sell: number | null; l2Stock: number | null;
  reorderPoint: number | null; leadTime: number | null;
};

function parseSheet(filePath: string, categoryFilter: string | null): Row[] {
  const buf = readFileSync(resolve(filePath));
  const ext = resolve(filePath).split('.').pop()?.toLowerCase();

  let raw: string[][];
  if (ext === 'csv') {
    // Parse CSV directly — XLSX handles it natively
    const wb = XLSX.read(buf, { type: 'buffer', raw: false });
    const ws = wb.Sheets[wb.SheetNames[0]];
    raw = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: '' }) as string[][];
  } else {
    const wb = XLSX.read(buf, { type: 'buffer' });
    const ws = wb.Sheets['Products'] ?? wb.Sheets[wb.SheetNames[0]];
    if (!ws) throw new Error('Could not find a Products sheet in the workbook');
    raw = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: '' }) as string[][];
  }

  // Skip rows until we find the data — look for row where col A is not a header word
  let startRow = 0;
  for (let i = 0; i < Math.min(raw.length, 5); i++) {
    const cell = String(raw[i]?.[0] ?? '').replace(/[🔵🟢🟡🟠]/g, '').trim().toUpperCase();
    if (!cell || cell.includes('DB NAME') || cell.includes('DO NOT EDIT') || cell.includes('SYSTEM KEY')) {
      startRow = i + 1;
    }
  }
  const data = raw.slice(startRow).filter(r => String(r[0] ?? '').trim());

  return data
    .map(r => ({
      dbName:       String(r[0]  ?? '').trim(),
      category:     String(r[1]  ?? '').trim(),
      correctName:  String(r[2]  ?? '').trim(),
      brand:        String(r[3]  ?? '').trim(),
      vat:          ni(r[4]),
      baseUnit:     String(r[5]  ?? '').trim() || 'Piece',
      baseCost:     n(r[6]),
      baseSell:     n(r[7]),
      baseStock:    n(r[8]),
      barcode:      String(r[9]  ?? '').trim(),
      l1Name:       String(r[10] ?? '').trim(),
      l1Qty:        ni(r[11]),
      l1Cost:       n(r[12]),
      l1Sell:       n(r[13]),
      l1Stock:      n(r[14]),
      l2Name:       String(r[15] ?? '').trim(),
      l2Qty:        ni(r[16]),
      l2Cost:       n(r[17]),
      l2Sell:       n(r[18]),
      l2Stock:      n(r[19]),
      reorderPoint: n(r[20]),
      leadTime:     ni(r[21]),
    }))
    .filter(r => r.dbName && (!categoryFilter || r.category === categoryFilter));
}

async function main() {
  const args        = process.argv.slice(2);
  const dryRun      = args.includes('--dry-run');
  const fileIdx     = args.indexOf('--file');
  const catIdx      = args.indexOf('--category');
  const filePath    = fileIdx >= 0 ? args[fileIdx + 1] : '../../vendor_catalogue_final.xlsx';
  const catFilter   = catIdx  >= 0 ? args[catIdx  + 1] : null;

  console.log(`Reading ${filePath}${catFilter ? ` (category: ${catFilter})` : ''}…`);
  if (dryRun) console.log('  DRY RUN — no DB writes');

  const rows = parseSheet(filePath, catFilter);
  console.log(`  ${rows.length} data rows\n`);

  const pool = dryRun ? null : new Pool({ connectionString: process.env.DATABASE_URL });

  const stats = { upserted: 0, created: 0, tiersCreated: 0, tiersNullQty: 0, warnings: 0, errors: 0, stockConverted: 0 };
  const errors: string[] = [];

  for (const row of rows) {
    try {
      const canonicalName = row.correctName || row.dbName;
      const vendorCodeSlug = slugify(row.dbName);

      // Auto-infer packaging when the vendor left L1/L2 cells blank
      if (!row.l1Qty && !row.l2Qty) {
        const inferred = inferPackaging(row.dbName, row.category);
        if (!row.l1Name && inferred.l1Name) row.l1Name = inferred.l1Name;
        if (!row.l1Qty  && inferred.l1Qty)  row.l1Qty  = inferred.l1Qty;
        if (!row.l2Name && inferred.l2Name) row.l2Name = inferred.l2Name;
        if (!row.l2Qty  && inferred.l2Qty)  row.l2Qty  = inferred.l2Qty;
      } else if (row.l2Name && !row.l2Qty) {
        // Has L2 name but missing qty — fill qty only
        const inferred = inferPackaging(row.dbName, row.category);
        if (inferred.l2Qty) row.l2Qty = inferred.l2Qty;
      }

      // If base unit is a packaging tier word, it means we only have bulk data — normalise
      const packWords = /^(carton|box|bag|bale|outer|pack|sack|jerry\s*can|bundle)$/i;
      if (packWords.test(row.baseUnit)) row.baseUnit = 'Piece';

      // ── 1. Convert stock to base units ──────────────────────────────────
      let baseStock = row.baseStock ?? 0;
      if (row.l1Qty && row.l1Stock) baseStock += row.l1Stock * row.l1Qty;
      if (row.l1Qty && row.l2Qty && row.l2Stock) baseStock += row.l2Stock * row.l1Qty * row.l2Qty;
      stats.stockConverted += baseStock;

      // ── 2. Upsert base Item ──────────────────────────────────────────────
      if (dryRun) {
        console.log(`  [dry] upsert "${canonicalName}" stock=${baseStock.toFixed(2)}`
          + (row.l1Name ? ` L1=${row.l1Name}(${row.l1Qty ?? '?'})` : '')
          + (row.l2Name ? ` L2=${row.l2Name}(${row.l2Qty ?? '?'})` : ''));
        stats.upserted++;
        if (row.l1Name) stats.tiersCreated++;
        if (row.l2Name) stats.tiersCreated++;
        if (row.l1Name && !row.l1Qty) stats.tiersNullQty++;
        if (row.l2Name && !(row.l1Qty && row.l2Qty)) stats.tiersNullQty++;
        continue;
      }

      // Find existing item by name or sku (handles partial previous runs)
      const existing = await pool!.query(
        `SELECT id FROM "Item" WHERE "storeId" = $1
         AND (name ILIKE $2 OR name ILIKE $3 OR sku = $4)
         LIMIT 1`,
        [STORE_ID, row.dbName, canonicalName, vendorCodeSlug]
      );

      let itemId: string;
      const isNew = existing.rows.length === 0;

      const notes = row.brand ? `Brand: ${row.brand}` : null;

      if (isNew) {
        itemId = uid();
        await pool!.query(
          `INSERT INTO "Item"
             (id,"storeId",name,sku,category,unit,"costPrice","sellingPrice","nomadBitePrice",
              "taxRate","currentStock","reorderPoint","leadTimeDays",barcode,notes,"updatedAt","createdAt")
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,0,$9,$10,$11,$12,$13,$14,NOW(),NOW())`,
          [
            itemId, STORE_ID, canonicalName, vendorCodeSlug,
            row.category, row.baseUnit,
            row.baseCost ?? 0, row.baseSell ?? 0,
            row.vat ?? 0, baseStock,
            row.reorderPoint, row.leadTime,
            row.barcode || null, notes,
          ]
        );
        stats.created++;
      } else {
        itemId = existing.rows[0].id;
        await pool!.query(
          `UPDATE "Item" SET
             name = $1, category = $2, unit = $3,
             "costPrice" = $4, "sellingPrice" = $5,
             "taxRate" = $6, "currentStock" = $7,
             "reorderPoint" = $8, "leadTimeDays" = $9,
             barcode = COALESCE($10, barcode),
             notes = COALESCE($11, notes),
             "updatedAt" = NOW()
           WHERE id = $12`,
          [
            canonicalName, row.category, row.baseUnit,
            row.baseCost ?? 0, row.baseSell ?? 0,
            row.vat ?? 0, baseStock,
            row.reorderPoint, row.leadTime,
            row.barcode || null, notes,
            itemId,
          ]
        );
      }
      stats.upserted++;

      // ── 3. Replace packaging tiers ─────────────────────────────────────
      await pool!.query(`DELETE FROM "PackagingTier" WHERE "itemId" = $1`, [itemId]);

      const insertTier = async (level: number, name: string, qtyInBase: number | null, cost: number | null, sell: number | null) => {
        if (!name) return;
        if (!qtyInBase || qtyInBase <= 0) {
          // qty unknown — skip tier, log warning
          stats.tiersNullQty++;
          stats.warnings++;
          return;
        }
        await pool!.query(
          `INSERT INTO "PackagingTier"
             (id,"itemId",name,level,"quantityInBase","costPrice","sellingPriceOverride","isBaseUnit","updatedAt","createdAt")
           VALUES ($1,$2,$3,$4,$5,$6,$7,false,NOW(),NOW())
           ON CONFLICT ("itemId",level) DO UPDATE
             SET name=$3, "quantityInBase"=$5, "costPrice"=$6, "sellingPriceOverride"=$7, "updatedAt"=NOW()`,
          [uid(), itemId, name, level, qtyInBase, cost ?? 0, sell ?? null]
        );
        stats.tiersCreated++;
      };

      if (row.l1Name) {
        await insertTier(1, row.l1Name, row.l1Qty, row.l1Cost, row.l1Sell);
      }
      if (row.l2Name) {
        // When no L1 tier, L2 qty is already "qty in base" (L1 implicitly = 1)
        const l1QtyForCalc = row.l1Qty || 1;
        const qtyInBase_L2 = row.l2Qty ? l1QtyForCalc * row.l2Qty : null;
        await insertTier(2, row.l2Name, qtyInBase_L2, row.l2Cost, row.l2Sell);
      }

    } catch (err: any) {
      stats.errors++;
      const msg = `Row "${row.dbName}": ${err.message}`;
      errors.push(msg);
      if (stats.errors <= 5) console.error('  ✗', msg);
    }
  }

  if (pool) await pool.end();

  // ── Summary ──────────────────────────────────────────────────────────────
  console.log('\n─────────────────────────────────────────────────');
  console.log(`✔  Items upserted:         ${stats.upserted.toLocaleString()}`);
  console.log(`   ├─ created:             ${stats.created.toLocaleString()}`);
  console.log(`   └─ updated:             ${(stats.upserted - stats.created).toLocaleString()}`);
  console.log(`✔  Packaging tiers:        ${stats.tiersCreated.toLocaleString()}`);
  console.log(`   └─ qty=null (pending):  ${stats.tiersNullQty.toLocaleString()}`);
  console.log(`⚠  Warnings:              ${stats.warnings.toLocaleString()}`);
  console.log(`✗  Errors:                ${stats.errors.toLocaleString()}`);
  console.log(`   Stock converted:       ${stats.stockConverted.toFixed(0)} base units`);
  console.log('─────────────────────────────────────────────────');
  if (dryRun) console.log('\n  DRY RUN — re-run without --dry-run to apply');
  if (errors.length > 5) console.log(`  (${errors.length - 5} more errors — check import_errors.log)`);
}

main().catch(e => { console.error(e); process.exit(1); });
