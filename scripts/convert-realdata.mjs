/**
 * Converts realData.txt (tab-separated, multi-row per item) into two CSVs:
 *   realData-import.csv    — valid products with corrected UOM tiers
 *   realData-anomalies.csv — items whose base unit quantity cannot be determined
 *
 * Classification rules applied per item:
 *  1. If a PCS row (or BULK_UOM at ratio=1) already exists → base is known, not anomaly
 *  2. Else if only BULK_UOM rows at ratio=1 exist (e.g. only CTN=1):
 *     a. Infer count from product name via inferRatioFromName()
 *        - If found: synthesise a PCS base row (baseCost = ctnCost / ratio)
 *     b. Water rule: CTN/BAL at ratio=1 with product name containing "WATER"
 *        must be >= 5L to be a valid single unit; else → anomaly
 *     c. JRC (jerry can) rule: always a valid single unit regardless of size
 *     d. BAG large-unit rule: bag name containing >= 10kg weight → valid single unit
 *     e. Anything else with no inferrable ratio → anomaly
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

// Water UOMs that require size validation
const WATER_BULK_UOMS = new Set(['CTN', 'BAL', 'OUT', 'HL', 'HLT']);

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

// ── UOM ratio inference from product name ────────────────────────────────────
// (mirrors parse-lungalunga.ts inferRatioFromName — keep in sync)

function inferRatioFromName(name) {
  const n = name.toUpperCase().trim();

  const UNIT = '(?:G|GM|GMS|GRM|GR|GRMS|KG|MG|ML|CL|L|LTR|LITRE|LITER)';
  // Format 1a: N*size_with_unit — N1 is count regardless of embedding
  const fmt1 = n.match(new RegExp(`(\\d+)\\s*\\*\\s*[\\d.]+\\s*${UNIT}\\b`, 'i'));
  if (fmt1) {
    const r = parseInt(fmt1[1], 10);
    if (r > 1 && r <= 1000) return r;
  }

  // Format 1b/2: N1*N2 no measurement unit
  const fmtAny = n.match(/(\d+)\s*\*\s*(\d+)/);
  if (fmtAny) {
    const idx = fmtAny.index;
    const prevChar = idx > 0 ? n[idx - 1] : '';
    const n1 = parseInt(fmtAny[1], 10);
    const n2 = parseInt(fmtAny[2], 10);
    const n1EmbeddedInWord = /[A-Z]/.test(prevChar);
    const ratio = n1EmbeddedInWord ? n2 : n1;
    if (ratio > 1 && ratio <= 1000) return ratio;
  }

  // Suffix: *Npcs / *N at end
  const fmt3 = n.match(/\*\s*(\d+)\s*(?:PCS?|PKT?S?|PK|PACK|UNITS?|BAGS?)?\s*$/);
  if (fmt3) {
    const r = parseInt(fmt3[1], 10);
    if (r > 1 && r <= 1000) return r;
  }

  return null;
}

// ── Size extraction helpers ──────────────────────────────────────────────────

function extractLitres(name) {
  const n = name.toUpperCase();
  // Match "5LTR", "5L", "5 L", "1.5LTR", "500ML"
  const ltr = n.match(/(\d+(?:\.\d+)?)\s*(?:LTR|LITRE|LITER|L)\b/);
  if (ltr) return parseFloat(ltr[1]);
  const ml = n.match(/(\d+(?:\.\d+)?)\s*ML\b/);
  if (ml) return parseFloat(ml[1]) / 1000;
  return null;
}

function extractKg(name) {
  const n = name.toUpperCase();
  const kg = n.match(/(\d+(?:\.\d+)?)\s*KG\b/);
  if (kg) return parseFloat(kg[1]);
  const g = n.match(/(\d+(?:\.\d+)?)\s*(?:G|GMS|GRM|GRMS)\b/);
  if (g) return parseFloat(g[1]) / 1000;
  return null;
}

// ── Classification logic ─────────────────────────────────────────────────────

function classifyItem(itemId, rows, description) {
  const name = description.toUpperCase();

  // Sort by ratio ascending
  rows.sort((a, b) => a.ratio - b.ratio);

  const baseRow = rows.find(r => r.ratio === 1);
  const bulkBaseRow = rows.find(r => r.ratio === 1 && BULK_UOMS.has(r.uom.toUpperCase()));
  const truePcsRow = rows.find(r => r.ratio === 1 && !BULK_UOMS.has(r.uom.toUpperCase()));

  // Already has a non-bulk base (PCS, KG, LTR, etc.) → valid, no inference needed
  if (truePcsRow) {
    return { valid: true, rows, synthesised: false };
  }

  // Only bulk row(s) at ratio=1 — need to classify
  if (bulkBaseRow && !truePcsRow) {
    const uom = bulkBaseRow.uom.toUpperCase();

    // JRC (jerry can) — always valid single unit
    if (uom === 'JRC') {
      return { valid: true, rows, synthesised: false };
    }

    // Large BAG (>= 10kg) — valid single unit
    if (uom === 'BAG') {
      const kg = extractKg(name);
      if (kg !== null && kg >= 10) {
        return { valid: true, rows, synthesised: false };
      }
    }

    // Water rule: CTN/BAL at ratio=1 must be >= 5L
    if (WATER_BULK_UOMS.has(uom) && name.includes('WATER')) {
      const litres = extractLitres(name);
      if (litres !== null && litres >= 5) {
        return { valid: true, rows, synthesised: false };
      }
      // Under 5L or unknown size water → anomaly
      return { valid: false, rows, reason: 'water-bulk-small' };
    }

    // Try to infer ratio from name
    const inferredRatio = inferRatioFromName(description);
    if (inferredRatio && inferredRatio > 1) {
      // Synthesise a PCS base row
      const synthCost = bulkBaseRow.cost > 0 ? bulkBaseRow.cost / inferredRatio : 0;
      const synthSell = bulkBaseRow.sell > 0 ? bulkBaseRow.sell / inferredRatio : 0;
      const pcsRow = {
        uom: 'PCS',
        ratio: 1,
        cost: synthCost,
        sell: synthSell,
        stock: bulkBaseRow.stock,
        barcode: bulkBaseRow.barcode,
        vat: bulkBaseRow.vat,
      };
      // Replace the bulk base with PCS, update bulk ratio to inferredRatio
      const updatedBulk = { ...bulkBaseRow, ratio: inferredRatio };
      const otherRows = rows.filter(r => r !== bulkBaseRow).map(r => ({
        ...r,
        ratio: r.ratio === 1 ? inferredRatio : r.ratio,
      }));
      return { valid: true, rows: [pcsRow, updatedBulk, ...otherRows], synthesised: true, inferredRatio };
    }

    // No ratio inferrable — anomaly
    return { valid: false, rows, reason: 'no-ratio-inferrable' };
  }

  // No base row at all (all ratios > 1) — anomaly
  if (!baseRow) {
    return { valid: false, rows, reason: 'no-base-row' };
  }

  // Default: has some kind of base row (ratio=1) that isn't bulk
  return { valid: true, rows, synthesised: false };
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

const ANOMALY_HEADER = [
  'DB Name', 'Correct Product Name', 'UOMs', 'Ratios', 'Reason',
];

const importRows = [OUTPUT_HEADER.join(',')];
const anomalyRows = [ANOMALY_HEADER.join(',')];

let totalImport = 0;
let totalAnomaly = 0;
let synthesised = 0;
let skipped = 0;

for (const [itemId, { description, rows }] of groups) {
  if (!description) { skipped++; continue; }

  rows.sort((a, b) => a.ratio - b.ratio);

  const result = classifyItem(itemId, rows, description);

  if (!result.valid) {
    const uoms = rows.map(r => r.uom).join('|');
    const ratios = rows.map(r => r.ratio).join('|');
    const anomalyCols = [itemId, description, uoms, ratios, result.reason ?? ''];
    anomalyRows.push(anomalyCols.map(csvCell).join(','));
    totalAnomaly++;
    continue;
  }

  if (result.synthesised) synthesised++;

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

const importPath = join(ROOT, 'realData-import.csv');
const anomalyPath = join(ROOT, 'realData-anomalies.csv');

writeFileSync(importPath, importRows.join('\n'), 'utf-8');
writeFileSync(anomalyPath, anomalyRows.join('\n'), 'utf-8');

console.log(`Import:   ${totalImport} products → realData-import.csv`);
console.log(`Anomaly:  ${totalAnomaly} products → realData-anomalies.csv`);
console.log(`Synth:    ${synthesised} base rows synthesised from name-inferred ratio`);
console.log(`Skipped:  ${skipped} rows with blank description`);
