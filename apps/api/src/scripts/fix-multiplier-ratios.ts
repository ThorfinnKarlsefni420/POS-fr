import { prisma } from '../lib/prisma.ts';

const STORE_ID = 'cmq9udymy0000v9drlfnnj7ps'; // Best Wholesalers Ltd

// Items where the name encodes the multiplier (e.g. "INDOMIE 20*120GMS" = carton of 20)
// but the only packaging tier was stored with ratio=1.0 (and renamed to PCS by previous fix).
// We restore the correct UOM name and set the true ratio.
const FIXES: Array<{ sku: string; ratio: number; uomName: string }> = [
  { sku: '2490', ratio: 72,  uomName: 'CTN' }, // ARIEL DOWNY 72*85G
  { sku: '1674', ratio: 18,  uomName: 'CTN' }, // DAIMA 18*500ML
  { sku: '1998', ratio: 12,  uomName: 'CTN' }, // DAIMA STRAWBERRY 12*500ML
  { sku: '2036', ratio: 12,  uomName: 'CTN' }, // DAIMA VANILLA 12*500ML
  { sku: '2082', ratio: 12,  uomName: 'CTN' }, // DELMONTE 12*1LTR
  { sku: '1999', ratio: 36,  uomName: 'CTN' }, // ENERGY BISCUITS 36*100G
  { sku: '1965', ratio: 12,  uomName: 'CTN' }, // FANAANA SOAP 12*800
  { sku: '2325', ratio: 60,  uomName: 'CTN' }, // GINGERNUT BISCUIT 60*30G
  { sku: '1414', ratio: 20,  uomName: 'CTN' }, // INDOMIE 20*120GMS
  { sku: '662',  ratio: 30,  uomName: 'CTN' }, // KAYSALT30* 200 GR
  { sku: '1357', ratio: 40,  uomName: 'BAG' }, // KAYSALT40* 500 GRM
  { sku: '1693', ratio: 40,  uomName: 'CTN' }, // KENSALT 40*500G
  { sku: '1678', ratio: 30,  uomName: 'CTN' }, // KENSALT30* 200G
  { sku: '2193', ratio: 300, uomName: 'CTN' }, // KOL CHILI SATCHET 300*20G
  { sku: '2072', ratio: 300, uomName: 'CTN' }, // KOL TOMATO SATCHET 300*20G
  { sku: '2299', ratio: 500, uomName: 'CTN' }, // LISHA MILK500*12
  { sku: '2329', ratio: 24,  uomName: 'CTN' }, // LUCOZADE 24*250ML
  { sku: '2238', ratio: 20,  uomName: 'DOZ' }, // NACET STAINLESS 20*5
  { sku: '1817', ratio: 12,  uomName: 'CTN' }, // NUMI 12*120G
  { sku: '2141', ratio: 12,  uomName: 'CTN' }, // SODA SPRITE 12*350ML
  { sku: '1546', ratio: 50,  uomName: 'CTN' }, // WEETABIX 50*37G
];

async function main() {
  let updated = 0;
  let skipped = 0;

  for (const { sku, ratio, uomName } of FIXES) {
    const item = await (prisma as any).item.findFirst({
      where: { sku, storeId: STORE_ID },
      include: { packagingTiers: true },
    });

    if (!item) {
      console.warn(`  SKIP: no item found for SKU ${sku}`);
      skipped++;
      continue;
    }

    // The tier we want is the one currently named PCS (renamed by previous fix) with ratio=1
    const tier = item.packagingTiers.find(
      (t: any) => t.name === 'PCS' && Number(t.quantityInBase) === 1
    );

    if (!tier) {
      console.warn(`  SKIP: ${item.name} — no PCS/ratio=1 tier found (tiers: ${item.packagingTiers.map((t: any) => `${t.name}(${t.quantityInBase})`).join(', ')})`);
      skipped++;
      continue;
    }

    await (prisma as any).packagingTier.update({
      where: { id: tier.id },
      data: { name: uomName, quantityInBase: ratio },
    });

    console.log(`  Fixed: ${item.name} | PCS(1) → ${uomName}(${ratio})`);
    updated++;
  }

  console.log(`\nDone. Updated: ${updated}, Skipped: ${skipped}.`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
