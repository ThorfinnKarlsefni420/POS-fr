/**
 * Converts realData.txt (tab-separated, multi-row per item) into realData-import.csv.
 *
 * Universal rule: every bulk pack (CTN/OUT/BAL/DOZ/JRC/BAG/TM/HL/HLT) = 30 PCS.
 *
 * Per item:
 *  - Already has explicit PCS/KG/LTR base → keep as-is
 *  - Has BULK_UOM at ratio=1 → synthesise PCS (cost÷30), L1=bulk(30), L2=higher tier or CTN(20)
 *  - No base row (ratio=0 / corrupt) → skip
 *
 * Input:  ITEM_ID | BAR_CODE | BAR_CODE2 | DESCRIPTION | UOM | UOM_RATIO | COST | PRICE | VAT_PERCENT | OPENING_BAL
 * Output: DB Name | Category | Correct Product Name | Base Unit | Base Cost | Base Sell | Base Stock | Barcode | VAT % | L1 Pack Name | L1 Qty in Base | L1 Cost | L1 Sell | L2 Pack Name | L2 Qty in L1 | L2 Cost | L2 Sell
 */

import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// UOMs that are "bulk" names — when ratio=1 they are really the base piece
const BULK_UOMS = new Set(['CTN', 'OUT', 'BAL', 'DOZ', 'JRC', 'BAG', 'TM', 'HL', 'HLT']);

function normaliseUom(uom, ratio) {
  return BULK_UOMS.has(uom.trim().toUpperCase()) && ratio === 1 ? 'PCS' : uom.trim();
}

function num(v) {
  const n = parseFloat(v);
  return isNaN(n) ? 0 : n;
}

function csvCell(v) {
  const s = String(v ?? '').trim();
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}


// ── Name anomaly detection ────────────────────────────────────────────────────
// Mirrors apps/api/src/scripts/classify-inventory.ts detectNameAnomalies()

function detectNameAnomalies(description) {
  const up = description.trim().toUpperCase();

  if (/^(TEST|DUMMY|SAMPLE|N\/A)\b/.test(up))
    return { reason: 'placeholder', notes: `Name "${description}" is a test or placeholder entry` };

  if (/[A-Z0-9]+\/[A-Z0-9]+/.test(up))
    return { reason: 'slash-variant', notes: `Name "${description}" lists multiple variants (slash-separated); create separate SKUs per variant` };

  const SIZE_UNIT = /\d+(?:\.\d+)?\s*(?:ML|L\b|LTR|G\b|GMS|GRM|KG)/i;
  if (/\b(ASSORTED|MIX)\b/i.test(up) && !SIZE_UNIT.test(up))
    return { reason: 'assorted-no-size', notes: `Name "${description}" is an assorted/mix product with no defined size — individual unit quantity unknown` };

  const sizeMatches = [...up.matchAll(/(\d+(?:\.\d+)?)\s*(ML|L\b|LTR|G\b|GMS|GRM|KG)/g)];
  const normalisedSizes = new Set(sizeMatches.map(m => {
    const val = parseFloat(m[1]);
    const unit = m[2].replace(/\s/g, '');
    if (unit === 'L' || unit === 'LTR') return `${val * 1000}ml`;
    if (unit === 'KG') return `${val * 1000}g`;
    return `${val}${unit.toLowerCase()}`;
  }));
  if (normalisedSizes.size >= 2)
    return { reason: 'multi-size', notes: `Name "${description}" contains ${normalisedSizes.size} different size specifications — unclear which size this record represents` };

  return null;
}

// ── Classification logic ─────────────────────────────────────────────────────
// Mirrors apps/api/src/scripts/classify-inventory.ts — keep in sync.
//
// Universal rule: every bulk pack = 30 PCS.
// Resolution order:
//  1. Fix non-bulk rows with ratio=0 (corrupt) → treat as ratio=1
//  2. Explicit non-bulk base (PCS/KG/LTR at ratio=1) → keep as-is
//  3. Bulk UOM at ratio=1 → synthesise PCS at ratio=30
//  4. All rows ratio>1 (no base) → synthesise PCS from smallest row at ratio=30
//  5. No rows → skip

const DEFAULT_RATIO = 30;   // pieces per inner pack
const DEFAULT_L2_QTY = 20;  // inner packs per outer carton

function classifyItem(rows) {
  if (rows.length === 0) return { valid: false, rows, reason: 'no-rows' };

  // Step 1: fix non-bulk rows where ratio=0 → should be base units at ratio=1
  const fixed = rows.map(r =>
    r.ratio === 0 && !BULK_UOMS.has(r.uom.trim().toUpperCase())
      ? { ...r, ratio: 1 }
      : r
  );
  fixed.sort((a, b) => a.ratio - b.ratio);

  const truePcsRow  = fixed.find(r => r.ratio === 1 && !BULK_UOMS.has(r.uom.trim().toUpperCase()));
  const bulkBaseRow = fixed.find(r => r.ratio === 1 &&  BULK_UOMS.has(r.uom.trim().toUpperCase()));

  // Step 2: explicit non-bulk base — keep all source tiers unchanged
  if (truePcsRow) {
    return { valid: true, rows: fixed, defaulted: false };
  }

  // Source row to synthesise PCS from: bulk-at-1 or (fallback) smallest-ratio row
  const sourceRow = bulkBaseRow ?? fixed[0];

  // Step 3/4: synthesise PCS base at ratio=30
  const pcsRow = {
    uom: 'PCS',
    ratio: 1,
    cost: sourceRow.cost > 0 ? sourceRow.cost / DEFAULT_RATIO : 0,
    sell: sourceRow.sell > 0 ? sourceRow.sell / DEFAULT_RATIO : 0,
    stock: sourceRow.stock * DEFAULT_RATIO,
    barcode: sourceRow.barcode,
    vat: sourceRow.vat,
  };
  const l1Row = { ...sourceRow, ratio: DEFAULT_RATIO };

  // Higher tiers: scale so ratios are relative to the new PCS base
  const higherRows = fixed
    .filter(r => r !== sourceRow)
    .map(r => ({
      ...r,
      ratio: sourceRow.ratio === 1
        ? r.ratio * DEFAULT_RATIO
        : Math.round((r.ratio / sourceRow.ratio) * DEFAULT_RATIO),
    }));

  const l2Rows = higherRows.length > 0 ? higherRows : [{
    uom: 'CTN',
    ratio: DEFAULT_RATIO * DEFAULT_L2_QTY,
    cost: sourceRow.cost * DEFAULT_L2_QTY,
    sell: sourceRow.sell * DEFAULT_L2_QTY,
    stock: 0,
    barcode: sourceRow.barcode,
    vat: sourceRow.vat,
  }];

  return { valid: true, rows: [pcsRow, l1Row, ...l2Rows], defaulted: true };
}

// ── Parse TSV ────────────────────────────────────────────────────────────────

const raw = readFileSync(join(ROOT, 'realData.txt'), 'utf-8');
const lines = raw.split('\n').map(l => l.replace(/\r$/, ''));

const header = lines[0].split('\t');
const COL = {};
header.forEach((h, i) => { COL[h.trim()] = i; });

// Group rows by ITEM_ID
const groups = new Map();

for (let i = 1; i < lines.length; i++) {
  const line = lines[i].trim();
  if (!line) continue;

  const cells = line.split('\t');
  const itemId = cells[COL['ITEM_ID']]?.trim();
  if (!itemId) continue;

  const uomRaw = cells[COL['UOM']]?.trim() ?? 'PCS';
  const ratio = num(cells[COL['UOM_RATIO']]);

  const row = {
    uom: uomRaw,           // keep raw for classification; normalised in output
    ratio,
    cost: num(cells[COL['COST']]),
    sell: num(cells[COL['PRICE']]),
    stock: num(cells[COL['OPENING_BAL']]),
    barcode: (() => {
      const b2 = cells[COL['BAR_CODE2']]?.trim() ?? '';
      const b1 = cells[COL['BAR_CODE']]?.trim() ?? '';
      return (b2 && b2 !== itemId) ? b2 : b1;
    })(),
    vat: num(cells[COL['VAT_PERCENT']]),
    description: cells[COL['DESCRIPTION']]?.trim() ?? '',
  };

  if (!row.description) continue;

  if (!groups.has(itemId)) groups.set(itemId, { description: row.description, rows: [] });
  groups.get(itemId).rows.push(row);
}

// ── Build output rows ────────────────────────────────────────────────────────

const OUTPUT_HEADER = [
  'DB Name', 'Category', 'Correct Product Name', 'Base Unit',
  'Base Cost', 'Base Sell', 'Base Stock', 'Barcode', 'VAT %',
  'L1 Pack Name', 'L1 Qty in Base', 'L1 Cost', 'L1 Sell',
  'L2 Pack Name', 'L2 Qty in L1', 'L2 Cost', 'L2 Sell',
];


const ANOMALY_HEADER = ['Source ID', 'Name', 'Reason', 'Notes'];

const importRows = [OUTPUT_HEADER.join(',')];
const anomalyRows = [ANOMALY_HEADER.join(',')];

let totalImport = 0;
let totalStructuralAnomaly = 0;
let totalNameAnomaly = 0;
let defaulted = 0;
let skipped = 0;

for (const [itemId, { description, rows }] of groups) {
  if (!description) { skipped++; continue; }

  // Check name-based anomalies first — still include in import CSV but flag separately
  const nameAnomaly = detectNameAnomalies(description);
  if (nameAnomaly) {
    anomalyRows.push([itemId, description, nameAnomaly.reason, nameAnomaly.notes].map(csvCell).join(','));
    totalNameAnomaly++;
  }

  rows.sort((a, b) => a.ratio - b.ratio);

  const result = classifyItem(rows);

  if (!result.valid) {
    totalStructuralAnomaly++;
    continue;
  }

  if (result.defaulted) defaulted++;

  const validRows = result.rows;
  validRows.sort((a, b) => a.ratio - b.ratio);

  const base = validRows[0];

  let l1Name = '', l1Qty = '', l1Cost = '', l1Sell = '';
  if (validRows.length >= 2) {
    const t1 = validRows[1];
    l1Name = t1.uom;
    l1Qty  = String(t1.ratio);
    l1Cost = String(t1.cost);
    l1Sell = String(t1.sell);
  }

  let l2Name = '', l2Qty = '', l2Cost = '', l2Sell = '';
  if (validRows.length >= 3) {
    const t1Ratio = validRows[1].ratio;
    const t2 = validRows[2];
    l2Name = t2.uom;
    const relQty = t1Ratio > 0 ? Math.round(t2.ratio / t1Ratio) : t2.ratio;
    l2Qty  = String(relQty);
    l2Cost = String(t2.cost);
    l2Sell = String(t2.sell);
  }

  const cols = [
    itemId, '', description, normaliseUom(base.uom, base.ratio),
    String(base.cost), String(base.sell), String(base.stock), base.barcode, String(base.vat),
    l1Name, l1Qty, l1Cost, l1Sell,
    l2Name, l2Qty, l2Cost, l2Sell,
  ];

  importRows.push(cols.map(csvCell).join(','));
  totalImport++;
}

writeFileSync(join(ROOT, 'realData-import.csv'), importRows.join('\n'), 'utf-8');

const anomalyPath = join(ROOT, 'realData-anomalies.csv');
if (anomalyRows.length > 1) {
  writeFileSync(anomalyPath, anomalyRows.join('\n'), 'utf-8');
  console.log(`${totalNameAnomaly} name anomalies written to realData-anomalies.csv`);
} else {
  if (existsSync(anomalyPath)) unlinkSync(anomalyPath);
  console.log('No name anomalies detected.');
}

console.log(`Done. ${totalImport} products written to realData-import.csv`);
console.log(`  With explicit PCS base: ${totalImport - defaulted}`);
console.log(`  Synthesised at ratio=30: ${defaulted}`);
if (totalStructuralAnomaly > 0) console.log(`Skipped: ${totalStructuralAnomaly} (no base row / corrupt ratio)`);
if (skipped > 0) console.log(`Skipped: ${skipped} (blank name)`);
