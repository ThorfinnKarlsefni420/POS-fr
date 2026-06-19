/**
 * Pure classification logic for inventory UOM tier resolution.
 * Exported for unit testing; consumed by scripts/convert-realdata.mjs (inline copy).
 *
 * Universal rule: every bulk pack = 30 PCS.
 */

export const BULK_UOMS = new Set(['CTN', 'OUT', 'BAL', 'DOZ', 'JRC', 'BAG', 'TM', 'HL', 'HLT']);

export const DEFAULT_RATIO = 30;   // PCS per inner pack
export const DEFAULT_L2_QTY = 20;  // inner packs per outer carton

export interface ClassifyRow {
  uom: string;
  ratio: number;
  cost: number;
  sell: number;
  stock: number;
  barcode: string;
  vat: number;
}

export interface ClassifyResult {
  valid: boolean;
  rows: ClassifyRow[];
  defaulted: boolean;
  reason?: string;
}

export interface NameAnomaly {
  reason: 'placeholder' | 'slash-variant' | 'assorted-no-size' | 'multi-size';
  notes: string;
}

/**
 * Detects name-based anomalies — items that are imported at ratio=30 but whose
 * product description is ambiguous or unresolvable without human review.
 *
 * Returns null for clean names.
 *
 * Rules:
 *  placeholder    — TEST / DUMMY / SAMPLE items; not real products
 *  slash-variant  — "ORANGE/COLA/BLACK" style; multiple variants in one SKU
 *  assorted-no-size — ASSORTED or MIX without any size unit; quantity undefined
 *  multi-size     — name lists two or more distinct measurement specs (500ML 1L);
 *                   the specific size this record refers to is unknown
 */
export function detectNameAnomalies(description: string): NameAnomaly | null {
  const up = description.trim().toUpperCase();

  // Placeholder: name is or starts with TEST / DUMMY / SAMPLE / N/A
  if (/^(TEST|DUMMY|SAMPLE|N\/A)\b/.test(up)) {
    return { reason: 'placeholder', notes: `Name "${description}" is a test or placeholder entry` };
  }

  // Slash-variant: X/Y or X/Y/Z patterns — multiple product variants under one SKU
  if (/[A-Z0-9]+\/[A-Z0-9]+/.test(up)) {
    return { reason: 'slash-variant', notes: `Name "${description}" lists multiple variants (slash-separated); create separate SKUs per variant` };
  }

  // Assorted / Mix without a size unit — no way to determine individual item weight or volume
  const SIZE_UNIT = /\d+(?:\.\d+)?\s*(?:ML|L\b|LTR|G\b|GMS|GRM|KG)/i;
  if (/\b(ASSORTED|MIX)\b/i.test(up) && !SIZE_UNIT.test(up)) {
    return { reason: 'assorted-no-size', notes: `Name "${description}" is an assorted/mix product with no defined size — individual unit quantity unknown` };
  }

  // Multi-size: two or more distinct measurement expressions in the name
  // e.g. "SUNTOP JUICE NO 500ML 1L" → sizes [500ML, 1L] → ambiguous
  const sizeMatches = [...up.matchAll(/(\d+(?:\.\d+)?)\s*(ML|L\b|LTR|G\b|GMS|GRM|KG)/g)];
  // Normalise to ml/g for comparison (L→ml, KG→g)
  const normalisedSizes = new Set(sizeMatches.map(m => {
    const val = parseFloat(m[1]);
    const unit = m[2].replace(/\s/g, '');
    if (unit === 'L' || unit === 'LTR') return `${val * 1000}ml`;
    if (unit === 'KG') return `${val * 1000}g`;
    return `${val}${unit.toLowerCase()}`;
  }));
  if (normalisedSizes.size >= 2) {
    return { reason: 'multi-size', notes: `Name "${description}" contains ${normalisedSizes.size} different size specifications — unclear which size this record represents` };
  }

  return null;
}

export function normaliseUom(uom: string, ratio: number): string {
  return BULK_UOMS.has(uom.trim().toUpperCase()) && ratio === 1 ? 'PCS' : uom.trim();
}

/**
 * Classifies one item's UOM rows into a base + tier structure.
 *
 * Resolution order:
 *  1. Fix non-bulk rows with ratio=0 (corrupt data) → treat as ratio=1
 *  2. If a true non-bulk base exists (PCS/KG/LTR at ratio=1) → keep as-is
 *  3. If a bulk UOM is at ratio=1 → synthesise PCS at ratio=30
 *  4. If ALL rows are ratio>1 (no base at all) → synthesise PCS from the
 *     smallest-ratio row at ratio=30
 *  5. No rows at all → skip
 */
export function classifyItem(rows: ClassifyRow[]): ClassifyResult {
  if (rows.length === 0) {
    return { valid: false, rows: [], defaulted: false, reason: 'no-rows' };
  }

  // Step 1: fix non-bulk rows with ratio=0 — should be base units (ratio=1)
  const fixed: ClassifyRow[] = rows.map(r =>
    r.ratio === 0 && !BULK_UOMS.has(r.uom.trim().toUpperCase())
      ? { ...r, ratio: 1 }
      : r
  );

  fixed.sort((a, b) => a.ratio - b.ratio);

  const truePcsRow  = fixed.find(r => r.ratio === 1 && !BULK_UOMS.has(r.uom.trim().toUpperCase()));
  const bulkBaseRow = fixed.find(r => r.ratio === 1 &&  BULK_UOMS.has(r.uom.trim().toUpperCase()));

  // Step 2: explicit non-bulk base — keep all tiers as sourced
  if (truePcsRow) {
    return { valid: true, rows: fixed, defaulted: false };
  }

  // Source row: either bulk-at-1 or (fallback) smallest-ratio row for all-ratio>1 items
  const sourceRow = bulkBaseRow ?? fixed[0];

  // Step 3 & 4: synthesise PCS base at DEFAULT_RATIO=30
  const pcsRow: ClassifyRow = {
    uom: 'PCS',
    ratio: 1,
    cost: sourceRow.cost > 0 ? sourceRow.cost / DEFAULT_RATIO : 0,
    sell: sourceRow.sell > 0 ? sourceRow.sell / DEFAULT_RATIO : 0,
    stock: sourceRow.stock * DEFAULT_RATIO,
    barcode: sourceRow.barcode,
    vat: sourceRow.vat,
  };

  const l1Row: ClassifyRow = { ...sourceRow, ratio: DEFAULT_RATIO };

  // Higher tiers: scale so their ratio is relative to the new PCS base
  const higherRows: ClassifyRow[] = fixed
    .filter(r => r !== sourceRow)
    .map(r => ({
      ...r,
      ratio: sourceRow.ratio === 1
        ? r.ratio * DEFAULT_RATIO                              // source was at ratio=1
        : Math.round((r.ratio / sourceRow.ratio) * DEFAULT_RATIO), // source was at ratio>1
    }));

  // If no second source tier: add synthetic outer CTN (20 inner packs)
  const l2Rows: ClassifyRow[] = higherRows.length > 0 ? higherRows : [{
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
