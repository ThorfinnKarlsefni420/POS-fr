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
