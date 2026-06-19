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

import { readFileSync, writeFileSync } from 'fs';
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


// ── Classification logic ─────────────────────────────────────────────────────
// Universal rule: every item uses ratio=30 (1 bulk pack = 30 PCS).
// Items that already have an explicit non-bulk base (PCS/KG/LTR at ratio=1)
// are kept as-is. Items with no base row at all (ratio=0 / corrupt) are skipped.

const DEFAULT_RATIO = 30;   // pieces per inner pack
const DEFAULT_L2_QTY = 20;  // inner packs per outer carton

function classifyItem(itemId, rows) {
  rows.sort((a, b) => a.ratio - b.ratio);

  const truePcsRow  = rows.find(r => r.ratio === 1 && !BULK_UOMS.has(r.uom.toUpperCase()));
  const bulkBaseRow = rows.find(r => r.ratio === 1 &&  BULK_UOMS.has(r.uom.toUpperCase()));

  // Item already has an explicit non-bulk base unit (PCS, KG, LTR, etc.) — keep as-is
  if (truePcsRow) {
    return { valid: true, rows, defaulted: false };
  }

  // Item has a bulk UOM at ratio=1 — synthesise PCS base using DEFAULT_RATIO=30
  if (bulkBaseRow) {
    const pcsRow = {
      uom: 'PCS',
      ratio: 1,
      cost: bulkBaseRow.cost > 0 ? bulkBaseRow.cost / DEFAULT_RATIO : 0,
      sell: bulkBaseRow.sell > 0 ? bulkBaseRow.sell / DEFAULT_RATIO : 0,
      stock: bulkBaseRow.stock * DEFAULT_RATIO,
      barcode: bulkBaseRow.barcode,
      vat: bulkBaseRow.vat,
    };
    const l1Row = { ...bulkBaseRow, ratio: DEFAULT_RATIO };
    // Any higher source tiers: scale their ratios relative to the new PCS base
    const higherRows = rows
      .filter(r => r !== bulkBaseRow && r.ratio > 1)
      .map(r => ({ ...r, ratio: r.ratio * DEFAULT_RATIO }));
    // If no second source tier exists, add a synthetic outer carton (20 inner packs)
    const l2Rows = higherRows.length > 0 ? higherRows : [{
      uom: 'CTN',
      ratio: DEFAULT_RATIO * DEFAULT_L2_QTY,
      cost: bulkBaseRow.cost * DEFAULT_L2_QTY,
      sell: bulkBaseRow.sell * DEFAULT_L2_QTY,
      stock: 0,
      barcode: bulkBaseRow.barcode,
      vat: bulkBaseRow.vat,
    }];
    return { valid: true, rows: [pcsRow, l1Row, ...l2Rows], defaulted: true };
  }

  // No usable base row (all ratios > 1, or ratio=0 corrupt data) — skip
  return { valid: false, rows, reason: 'no-base-row' };
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


const importRows = [OUTPUT_HEADER.join(',')];

let totalImport = 0;
let totalAnomaly = 0;
let defaulted = 0;
let skipped = 0;

for (const [itemId, { description, rows }] of groups) {
  if (!description) { skipped++; continue; }

  rows.sort((a, b) => a.ratio - b.ratio);

  const result = classifyItem(itemId, rows);

  if (!result.valid) {
    totalAnomaly++;
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

console.log(`Done. ${totalImport} products written to realData-import.csv`);
console.log(`  With explicit PCS base: ${totalImport - defaulted}`);
console.log(`  Synthesised at ratio=30: ${defaulted}`);
console.log(`Skipped: ${totalAnomaly} (no base row / corrupt ratio) + ${skipped} (blank name)`);
