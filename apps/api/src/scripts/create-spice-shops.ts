import { prisma } from '../lib/prisma.ts';

type ProductRow = { name: string; price: number | null };

type ShopDef = {
  name: string;
  slug: string;
  phone: string;
  products: ProductRow[];
};

function slugify(s: string) {
  return s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

const shops: ShopDef[] = [
  {
    name: 'Fresh Saudi Dates',
    slug: 'fresh-saudi-dates',
    phone: '0723 883 224',
    products: [
      { name: 'Black Pepper', price: 1250 },
      { name: 'Turmeric', price: 350 },
      { name: 'Cinnamon', price: 550 },
      { name: 'Coriander', price: 500 },
      { name: 'Ginger Powder', price: 700 },
      { name: 'Garlic Powder', price: null },
      { name: 'Chilli Powder', price: 600 },
      { name: 'Curry Powder', price: 550 },
      { name: 'Beef Masala', price: 600 },
      { name: 'Chicken Masala', price: 600 },
      { name: 'Nutmeg', price: 950 },
      { name: 'Fenugreek', price: 400 },
      { name: 'Cayenne Pepper', price: 500 },
      { name: 'Hibiscus', price: 700 },
      { name: 'Coconut Powder', price: 600 },
      { name: 'Black Seed', price: 600 },
      { name: 'Sea Moss', price: 550 },
      { name: 'Moringa', price: 550 },
      { name: 'Ashwagandha (Seed)', price: 550 },
      { name: 'Ashwagandha (Powder)', price: 700 },
      { name: 'Cardamom (Green)', price: 4000 },
      { name: 'Cardamom (Green - WS)', price: 3600 },
      { name: 'Cardamom (White)', price: 2600 },
      { name: 'Fennel', price: 600 },
      { name: 'Rosemary', price: 500 },
      { name: 'Peppermint', price: null },
      { name: 'Henna', price: 550 },
    ],
  },
  {
    name: 'Elwak Spices',
    slug: 'elwak-spices',
    phone: '0727 084 506',
    products: [
      { name: 'Black Pepper', price: 1100 },
      { name: 'Turmeric', price: 400 },
      { name: 'Cinnamon', price: 450 },
      { name: 'Coriander', price: 400 },
      { name: 'Ginger Powder', price: 650 },
      { name: 'Garlic Powder', price: null },
      { name: 'Chilli Powder', price: 400 },
      { name: 'Curry Powder', price: 500 },
      { name: 'Beef Masala', price: null },
      { name: 'Chicken Masala', price: null },
      { name: 'Nutmeg', price: null },
      { name: 'Fenugreek', price: 300 },
      { name: 'Cayenne Pepper', price: 500 },
      { name: 'Hibiscus', price: 550 },
      { name: 'Coconut Powder', price: null },
      { name: 'Black Seed', price: 700 },
      { name: 'Sea Moss', price: 500 },
      { name: 'Moringa', price: 550 },
      { name: 'Ashwagandha (Powder)', price: 700 },
      { name: 'Cardamom (Green)', price: 3600 },
      { name: 'Fennel', price: 400 },
      { name: 'Rosemary', price: 500 },
      { name: 'Peppermint', price: null },
      { name: 'Henna', price: null },
    ],
  },
  {
    name: 'Khalif Spices',
    slug: 'khalif-spices',
    phone: '0723 336 030',
    products: [
      { name: 'Black Pepper', price: 1200 },
      { name: 'Turmeric (India)', price: 700 },
      { name: 'Turmeric (Ethiopia)', price: 200 },
      { name: 'Cinnamon', price: 600 },
      { name: 'Coriander', price: 400 },
      { name: 'Ginger Powder', price: 600 },
      { name: 'Garlic Powder', price: 600 },
      { name: 'Chilli Powder', price: 400 },
      { name: 'Curry Powder', price: 600 },
      { name: 'Beef Masala', price: 600 },
      { name: 'Chicken Masala', price: 600 },
      { name: 'Nutmeg', price: 1400 },
      { name: 'Fenugreek', price: 400 },
      { name: 'Cayenne Pepper', price: 400 },
      { name: 'Hibiscus', price: 700 },
      { name: 'Coconut Powder', price: 550 },
      { name: 'Black Seed', price: 800 },
      { name: 'Sea Moss', price: 1200 },
      { name: 'Moringa', price: 800 },
      { name: 'Cardamom (Green)', price: 3500 },
      { name: 'Cardamom (White)', price: 2000 },
      { name: 'Fennel', price: 500 },
      { name: 'Rosemary', price: 400 },
      { name: 'Peppermint', price: null },
      { name: 'Henna', price: null },
    ],
  },
];

async function main() {
  for (const shop of shops) {
    console.log(`\n=== ${shop.name} ===`);

    let store = await (prisma as any).store.findUnique({ where: { slug: shop.slug } });
    if (store) {
      console.log('Store already exists:', store.id);
    } else {
      store = await (prisma as any).store.create({
        data: {
          name: shop.name,
          slug: shop.slug,
          phone: shop.phone,
        },
      });
      console.log('Store created:', store.id);
    }

    let admin = await (prisma as any).user.findFirst({
      where: { storeId: store.id, role: 'ADMIN' },
    });
    if (admin) {
      console.log('Admin already exists:', admin.id);
    } else {
      admin = await (prisma as any).user.create({
        data: {
          name: `${shop.name} Admin`,
          pin: '1234',
          role: 'ADMIN',
          storeId: store.id,
        },
        select: { id: true, name: true, role: true, storeId: true },
      });
      console.log('Admin user created:', admin.id, '(PIN: 1234)');
    }

    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const product of shop.products) {
      if (product.price === null) {
        skipped++;
        continue;
      }

      const sku = slugify(product.name);
      const existingItem = await (prisma as any).item.findUnique({
        where: { storeId_sku: { storeId: store.id, sku } },
      });

      if (existingItem) {
        await (prisma as any).item.update({
          where: { id: existingItem.id },
          data: {
            costPrice: product.price,
            sellingPrice: product.price,
          },
        });
        updated++;
      } else {
        await (prisma as any).item.create({
          data: {
            storeId: store.id,
            name: product.name,
            sku,
            category: 'Spices',
            unit: 'kg',
            costPrice: product.price,
            sellingPrice: product.price,
            nomadBitePrice: 0,
            supplierName: shop.name,
            supplierPhone: shop.phone,
          },
        });
        created++;
      }
    }

    console.log(`Items — created: ${created}, updated: ${updated}, skipped (no price): ${skipped}`);
  }

  console.log('\nDone. All admin PINs are 1234 — change them after first login.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await (prisma as any).$disconnect();
  });
