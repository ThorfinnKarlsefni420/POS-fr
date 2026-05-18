export interface PackagingNorm {
  l1Name?: string;
  l1Qty?: number;
  l2Name?: string;
  l2Qty?: number;
}

// Matches "AJAB 24*1KG", "BROOKSIDE 6*2.5KG", "ALWAYS 16*7 BLUE", "20*500G"
export function inferFromDbName(dbName: string): PackagingNorm {
  const m = dbName.match(/\b(\d+)\s*[*×xX]\s*[\d.]+/i);
  if (m) {
    const qty = parseInt(m[1], 10);
    if (qty > 1 && qty <= 500) return { l2Name: 'Carton', l2Qty: qty };
  }
  return {};
}

// Category norms — lower-cased keys, matched case-insensitively
const CATEGORY_NORMS: Record<string, PackagingNorm> = {
  'staples - pasta & noodles':    { l2Name: 'Carton', l2Qty: 20 },
  'staples - rice':               { l2Name: 'Bag',    l2Qty: 10 },
  'staples - flour & ugali':      { l2Name: 'Bag',    l2Qty: 10 },
  'cooking oil':                  { l2Name: 'Carton', l2Qty: 12 },
  'dairy - milk':                 { l2Name: 'Carton', l2Qty: 12 },
  'dairy - yoghurt':              { l2Name: 'Carton', l2Qty: 12 },
  'baby care - diapers':          { l2Name: 'Carton', l2Qty: 6  },
  'baby care - infant formula':   { l2Name: 'Carton', l2Qty: 6  },
  'tomato paste & sauce':         { l2Name: 'Carton', l2Qty: 24 },
  'beverages - juice & drinks':   { l2Name: 'Carton', l2Qty: 12 },
  'beverages - water':            { l2Name: 'Carton', l2Qty: 12 },
  'beverages - energy drinks':    { l2Name: 'Carton', l2Qty: 24 },
  'beverages - soda':             { l2Name: 'Carton', l2Qty: 24 },
  'personal care - hair care':    { l2Name: 'Carton', l2Qty: 12 },
  'personal care - skin care':    { l2Name: 'Carton', l2Qty: 12 },
  'personal care - oral care':    { l1Name: 'Dozen',  l1Qty: 12, l2Name: 'Carton', l2Qty: 6 },
  'personal care - body care':    { l2Name: 'Carton', l2Qty: 12 },
  'household - detergents':       { l2Name: 'Carton', l2Qty: 12 },
  'household - dishwashing':      { l2Name: 'Carton', l2Qty: 12 },
  'household - insecticides':     { l2Name: 'Carton', l2Qty: 12 },
  'snacks & confectionery':       { l2Name: 'Carton', l2Qty: 12 },
  'biscuits & bread':             { l2Name: 'Carton', l2Qty: 12 },
  'other - general merchandise':  { l2Name: 'Carton', l2Qty: 12 },
};

// Adjust cooking oil carton size by product name (5L → 4/carton, others → 12)
function cookingOilQty(productName: string): number {
  const n = productName.toUpperCase();
  if (/\b5\s*L(TR|ITRE)?\b/.test(n) || /\b5000\s*ML\b/.test(n)) return 4;
  if (/\b20\s*L(TR|ITRE)?\b/.test(n)) return 1;
  return 12;
}

export function inferPackaging(dbName: string, category: string): PackagingNorm {
  // DB Name pattern has highest confidence
  const fromDb = inferFromDbName(dbName);
  if (fromDb.l2Qty) return fromDb;

  // Category norms as fallback
  const cat = category.toLowerCase().trim();

  if (cat.includes('cooking oil')) {
    return { l2Name: 'Carton', l2Qty: cookingOilQty(dbName) };
  }

  for (const [key, norm] of Object.entries(CATEGORY_NORMS)) {
    if (cat.includes(key) || key.includes(cat)) return norm;
  }

  return {};
}
