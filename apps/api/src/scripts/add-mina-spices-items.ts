import { prisma } from '../lib/prisma.ts';

// One-off: populates Mina Spices ltd (slug "eastleigh-12"), which had 0 items.
// First 23 rows mirror Khalif Spices' catalog (same SKUs/prices, per user-provided
// table). Remaining rows are additional products from the user, deduped against
// that table: "Seamose 600" dropped (= Sea Moss, already priced at 1200) and
// "Candamon 2500" dropped (ambiguous vs. existing Cardamom Green/White entries).
const STORE_SLUG = 'eastleigh-12';

interface Row {
  name: string;
  sku: string;
  category: string;
  unit: string;
  price: number;
}

const rows: Row[] = [
  { name: 'Beef Masala', sku: 'beef-masala', category: 'Spices', unit: 'kg', price: 600 },
  { name: 'Black Pepper', sku: 'black-pepper', category: 'Spices', unit: 'kg', price: 1200 },
  { name: 'Black Seed', sku: 'black-seed', category: 'Spices', unit: 'kg', price: 800 },
  { name: 'Cardamom (Green)', sku: 'cardamom-green', category: 'Spices', unit: 'kg', price: 3500 },
  { name: 'Cardamom (White)', sku: 'cardamom-white', category: 'Spices', unit: 'kg', price: 2000 },
  { name: 'Cayenne Pepper', sku: 'cayenne-pepper', category: 'Spices', unit: 'kg', price: 400 },
  { name: 'Chicken Masala', sku: 'chicken-masala', category: 'Spices', unit: 'kg', price: 600 },
  { name: 'Chilli Powder', sku: 'chilli-powder', category: 'Spices', unit: 'kg', price: 400 },
  { name: 'Cinnamon', sku: 'cinnamon', category: 'Spices', unit: 'kg', price: 600 },
  { name: 'Coconut Powder', sku: 'coconut-powder', category: 'Spices', unit: 'kg', price: 550 },
  { name: 'Coriander', sku: 'coriander', category: 'Spices', unit: 'kg', price: 400 },
  { name: 'Curry Powder', sku: 'curry-powder', category: 'Spices', unit: 'kg', price: 600 },
  { name: 'Fennel', sku: 'fennel', category: 'Spices', unit: 'kg', price: 500 },
  { name: 'Fenugreek', sku: 'fenugreek', category: 'Spices', unit: 'kg', price: 400 },
  { name: 'Garlic Powder', sku: 'garlic-powder', category: 'Spices', unit: 'kg', price: 600 },
  { name: 'Ginger Powder', sku: 'ginger-powder', category: 'Spices', unit: 'kg', price: 600 },
  { name: 'Hibiscus', sku: 'hibiscus', category: 'Spices', unit: 'kg', price: 700 },
  { name: 'Moringa', sku: 'moringa', category: 'Spices', unit: 'kg', price: 800 },
  { name: 'Nutmeg', sku: 'nutmeg', category: 'Spices', unit: 'kg', price: 1400 },
  { name: 'Rosemary', sku: 'rosemary', category: 'Spices', unit: 'kg', price: 400 },
  { name: 'Sea Moss', sku: 'sea-moss', category: 'Spices', unit: 'kg', price: 1200 },
  { name: 'Turmeric (Ethiopia)', sku: 'turmeric-ethiopia', category: 'Spices', unit: 'kg', price: 200 },
  { name: 'Turmeric (India)', sku: 'turmeric-india', category: 'Spices', unit: 'kg', price: 700 },

  // Additional items (deduped against the list above)
  { name: 'Moringa Powder', sku: 'moringa-powder', category: 'Spices', unit: 'kg', price: 550 },
  { name: 'Ashwagandha', sku: 'ashwagandha', category: 'Spices', unit: 'kg', price: 550 },
  { name: 'Coffee Powder', sku: 'coffee-powder', category: 'Spices', unit: 'kg', price: 1300 },
  { name: 'Onion Powder', sku: 'onion-powder', category: 'Spices', unit: 'kg', price: 600 },
  { name: 'Fennel Powder', sku: 'fennel-powder', category: 'Spices', unit: 'kg', price: 750 },
  { name: 'Rosemary Powder', sku: 'rosemary-powder', category: 'Spices', unit: 'kg', price: 450 },
  { name: 'Peppermint Powder', sku: 'peppermint-powder', category: 'Spices', unit: 'kg', price: 550 },
  { name: 'Henna', sku: 'henna', category: 'Spices', unit: 'kg', price: 600 },
  { name: 'Black Seed Oil 1L', sku: 'black-seed-oil-1l', category: 'Spices', unit: '1l', price: 3400 },
  { name: 'Black Seed Organic 60ml', sku: 'black-seed-organic-60ml', category: 'Spices', unit: '60ml', price: 250 },
  { name: 'Black Seed Oil 500ml', sku: 'black-seed-oil-500ml', category: 'Spices', unit: '500ml', price: 1700 },

  // Nuts
  { name: 'Cashew', sku: 'cashew', category: 'Nuts', unit: 'kg', price: 1200 },
  { name: 'Almond', sku: 'almond', category: 'Nuts', unit: 'kg', price: 2400 },
  { name: 'Pumpkin Seed Roasted', sku: 'pumpkin-seed-roasted', category: 'Nuts', unit: 'kg', price: 1200 },
  { name: 'Sunflower', sku: 'sunflower', category: 'Nuts', unit: 'kg', price: 800 },
  { name: 'Macadamia', sku: 'macadamia', category: 'Nuts', unit: 'kg', price: 800 },
];

async function main() {
  const store = await prisma.store.findUnique({ where: { slug: STORE_SLUG } });
  if (!store) throw new Error(`Store "${STORE_SLUG}" not found`);

  const data = rows.map((r) => ({
    storeId: store.id,
    name: r.name,
    sku: r.sku,
    category: r.category,
    unit: r.unit,
    costPrice: r.price,
    sellingPrice: r.price,
    nomadBitePrice: 0,
    supplierName: store.name,
  }));

  const result = await prisma.item.createMany({ data, skipDuplicates: true });
  console.log(`Done — ${result.count} items inserted into "${store.name}" (${store.id}).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
