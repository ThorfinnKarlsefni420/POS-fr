import { readFileSync } from 'fs';
import { join } from 'path';
import { Pool } from 'pg';

const STORE_ID = 'store_hasans';
const TSV_PATH = join(process.cwd(), '../../Products.tsv');

// Columns (0-indexed):
// 0=Description(short code) 1=ItemName(full) 2=Category 3=BuyingPrice
// 4=SellingPrice 5=VAT 6=ItemsBalance 7=Bar_Code_2 8=UOM_ID

function toSku(code: string, unit: string): string {
  const c = code.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 28);
  const u = unit.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 8);
  return `${c}_${u}`.replace(/_+/g, '_').replace(/^_|_$/g, '');
}

function uid(): string {
  return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  const raw   = readFileSync(TSV_PATH, 'utf-8');
  const lines = raw.split('\n').filter(l => l.trim()).slice(1); // skip header
  console.log(`Parsing ${lines.length} rows…`);

  // Deduplicate by SKU — prefer the row with a filled category/fullName
  const bySkuRich = new Map<string, {
    shortCode: string; fullName: string; category: string;
    costPrice: number; sellingPrice: number; vatRate: number;
    currentStock: number; barcode: string | null; unit: string;
  }>();
  const skuCount = new Map<string, number>();

  for (const line of lines) {
    const c = line.split('\t');

    const shortCode    = c[0]?.trim() ?? '';
    const fullName     = c[1]?.trim() ?? '';
    const category     = c[2]?.trim() ?? '';
    const costPrice    = parseFloat(c[3]) || 0;
    const sellingPrice = parseFloat(c[4]) || 0;
    const vatRate      = parseInt(c[5])   || 0;
    const currentStock = parseFloat(c[6]) || 0;
    const barcode      = c[7]?.trim() || null;
    const unit         = c[8]?.trim() ?? '';

    if (!(fullName || shortCode)) continue;
    if (costPrice > 999999 || sellingPrice > 999999) {
      console.warn(`\nSkipping corrupt row: "${fullName || shortCode}" buy=${costPrice} sell=${sellingPrice}`);
      continue;
    }

    const baseSku = toSku(shortCode || fullName, unit);
    const existing = bySkuRich.get(baseSku);
    // Prefer this row if it has richer data (category or fullName) over the existing one
    if (!existing || (!existing.category && category) || (!existing.fullName && fullName)) {
      bySkuRich.set(baseSku, { shortCode, fullName, category, costPrice, sellingPrice, vatRate, currentStock, barcode, unit });
    }
  }

  const rows: any[][] = [];

  for (const [baseSku, d] of bySkuRich) {
    const count = (skuCount.get(baseSku) ?? 0) + 1;
    skuCount.set(baseSku, count);
    const sku  = count === 1 ? baseSku : `${baseSku}_${count}`;
    const name = d.fullName || d.shortCode;

    rows.push([
      uid(), STORE_ID, name, sku, d.category, d.unit,
      d.costPrice, d.sellingPrice, d.vatRate,
      d.vatRate === 16 ? 'vatcls_standard' : 'vatcls_exempt',
      d.vatRate === 0,  // needsVatConfirmation
      d.currentStock, d.barcode,
    ]);
  }

  console.log(`Inserting ${rows.length} items…`);

  const BATCH = 500;
  let inserted = 0;

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const vals: any[] = [];
    const ph = batch.map((row, ri) => {
      const b = ri * 13;
      vals.push(...row);
      // nomadBitePrice = 0 (superadmin recalculates after import)
      return `($${b+1},$${b+2},$${b+3},$${b+4},$${b+5},$${b+6},$${b+7},$${b+8},0,$${b+9},$${b+10},$${b+11},$${b+12},$${b+13},NOW(),NOW())`;
    });

    await pool.query(
      `INSERT INTO "Item"
         (id,"storeId",name,sku,category,unit,"costPrice","sellingPrice","nomadBitePrice","taxRate","vatClassId","needsVatConfirmation","currentStock",barcode,"createdAt","updatedAt")
       VALUES ${ph.join(',')}
       ON CONFLICT ("storeId",sku) DO NOTHING`,
      vals
    );

    inserted += batch.length;
    process.stdout.write(`\r  ${inserted}/${rows.length}`);
  }

  console.log(`\nDone — ${inserted} items imported into "${STORE_ID}".`);
  console.log('Next: POST /api/superadmin/recalculate-prices to set NomadBite prices.');
  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
