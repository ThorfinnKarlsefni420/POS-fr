/**
 * Converts realData.txt (tab-separated, multi-row per item) into the
 * NomadBite product-import-template.csv format.
 *
 * Input columns:  ITEM_ID | BAR_CODE | BAR_CODE2 | DESCRIPTION | UOM | UOM_RATIO | UOM_SUFFIX | COST | PRICE | VAT_PERCENT | OPENING_BAL
 * Output columns: DB Name | Category | Correct Product Name | Base Unit | Base Cost | Base Sell | Base Stock | Barcode | VAT % | L1 Pack Name | L1 Qty in Base | L1 Cost | L1 Sell | L2 Pack Name | L2 Qty in L1 | L2 Cost | L2 Sell
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
  // Escape quotes; wrap in quotes if contains comma, quote, or newline
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

// ── Parse TSV ────────────────────────────────────────────────────────────────

const raw = readFileSync(join(ROOT, 'realData.txt'), 'utf-8');
const lines = raw.split('\n').map(l => l.replace(/\r$/, ''));

const header = lines[0].split('\t');
const COL = {};
header.forEach((h, i) => { COL[h.trim()] = i; });

// Group rows by ITEM_ID
const groups = new Map(); // itemId → row[]

for (let i = 1; i < lines.length; i++) {
  const line = lines[i].trim();
  if (!line) continue;

  const cells = line.split('\t');
  const itemId = cells[COL['ITEM_ID']]?.trim();
  if (!itemId) continue;

  if (!groups.has(itemId)) groups.set(itemId, []);
  groups.get(itemId).push(cells);
}

// ── Convert each group to one CSV row ────────────────────────────────────────

const OUTPUT_HEADER = [
  'DB Name', 'Category', 'Correct Product Name', 'Base Unit',
  'Base Cost', 'Base Sell', 'Base Stock', 'Barcode', 'VAT %',
  'L1 Pack Name', 'L1 Qty in Base', 'L1 Cost', 'L1 Sell',
  'L2 Pack Name', 'L2 Qty in L1', 'L2 Cost', 'L2 Sell',
];

const outRows = [OUTPUT_HEADER.join(',')];
let total = 0;
let skipped = 0;

for (const [itemId, rows] of groups) {
  // Sort by UOM_RATIO ascending (base unit = smallest ratio, usually 1.0)
  rows.sort((a, b) => num(a[COL['UOM_RATIO']]) - num(b[COL['UOM_RATIO']]));

  const base = rows[0];
  const barCode  = base[COL['BAR_CODE']]?.trim() ?? '';
  const barCode2 = base[COL['BAR_CODE2']]?.trim() ?? '';
  const description = base[COL['DESCRIPTION']]?.trim() ?? '';
  if (!description) { skipped++; continue; }

  const baseRatio = num(base[COL['UOM_RATIO']]);
  const baseUom   = normaliseUom(base[COL['UOM']] ?? 'PCS', baseRatio);
  const baseCost  = num(base[COL['COST']]);
  const baseSell  = num(base[COL['PRICE']]);
  const baseStock = num(base[COL['OPENING_BAL']]);
  const vat       = num(base[COL['VAT_PERCENT']]);

  // Prefer the longer/more-meaningful barcode; fall back to 7-digit BAR_CODE
  const barcode = (barCode2 && barCode2 !== itemId) ? barCode2 : barCode;

  // DB Name = ITEM_ID so the slugified SKU is stable and matches the source system
  const dbName = itemId;
  const productName = description;

  // Tier 1 (second-smallest ratio)
  let l1Name = '', l1Qty = '', l1Cost = '', l1Sell = '';
  if (rows.length >= 2) {
    const t1 = rows[1];
    const t1Ratio = num(t1[COL['UOM_RATIO']]);
    l1Name = t1[COL['UOM']]?.trim() ?? '';
    l1Qty  = String(t1Ratio);
    l1Cost = String(num(t1[COL['COST']]));
    l1Sell = String(num(t1[COL['PRICE']]));
  }

  // Tier 2 (third entry)
  let l2Name = '', l2Qty = '', l2Cost = '', l2Sell = '';
  if (rows.length >= 3) {
    const t1Ratio = num(rows[1][COL['UOM_RATIO']]);
    const t2 = rows[2];
    const t2Ratio = num(t2[COL['UOM_RATIO']]);
    l2Name = t2[COL['UOM']]?.trim() ?? '';
    // L2 Qty in L1 = how many L1 units fit in one L2
    const relQty = t1Ratio > 0 ? Math.round(t2Ratio / t1Ratio) : t2Ratio;
    l2Qty  = String(relQty);
    l2Cost = String(num(t2[COL['COST']]));
    l2Sell = String(num(t2[COL['PRICE']]));
  }

  const cols = [
    dbName, '', productName, baseUom,
    String(baseCost), String(baseSell), String(baseStock), barcode, String(vat),
    l1Name, l1Qty, l1Cost, l1Sell,
    l2Name, l2Qty, l2Cost, l2Sell,
  ];

  outRows.push(cols.map(csvCell).join(','));
  total++;
}

const outPath = join(ROOT, 'realData-import.csv');
writeFileSync(outPath, outRows.join('\n'), 'utf-8');

console.log(`Done. ${total} products written to realData-import.csv (${skipped} skipped).`);
console.log(`Output: ${outPath}`);
