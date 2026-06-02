import { prisma } from '../lib/prisma.ts';

const CATEGORY_MAPPING: Record<string, string[]> = {
  'Rice': ['RICE', 'BRIYANI', 'AHLAN', 'AJAB', 'AKAARA', 'AL FANAR', 'AL SABAAH', 'ALQAMAR', 'ALSHIFA', 'AMINA', 'AMIR'],
  'Milk & Dairy': ['MILK', 'CREAM', 'YOGHURT', 'DAIRY', 'ADMIRAL', 'AL YOOM', 'ALFRESH', 'ALPHA', 'ANCHOR', 'POWDER'],
  'Tea & Beverages': ['TEA', 'SODA', 'JUCIE', 'AFIA', 'DRINKING', 'COFFEE', 'WATER', 'AQUA', 'JUICE', 'ENERGY DRINK', 'MALT'],
  'Snacks & Biscuits': ['SNACK', 'BUISCIT', 'BISCUIT', 'CHOCOLATE', 'SWEETS', 'CHIPS', 'CHOGOLATE', 'WAFER', 'COOKIES'],
  'Oil & Fats': ['OIL', 'SUNFLOWER', 'OLIVE', 'MAYONNAISE', 'FAT', 'BUTTER', 'MARGARINE', 'AVENA', 'AMBER', 'SALIT', 'FRESHIA'],
  'Grains & Pasta': ['MAKORONI', 'NOODLES', 'MACO', 'ANKARA', 'FUSULI', 'LINGUINE', 'SPAGHETTI', 'PASTA', 'FLOUR', 'UNGANO', 'UNGA', 'MAKROONI', 'PEMBE', 'EXE', 'AJAB', 'SOWE'],
  'Personal Care': ['DIAPERS', 'BODY CREAM', 'HAIR OIL', 'ALWAYS', 'SHAMPOO', 'SANITIZER', 'SOAP', 'LOTION', 'PASTE', 'TOOTH', 'ANTIBACTERIAL', 'WIPES', 'ARIMIS', 'VASELINE', 'DETTOL', 'GEISHA'],
  'Household': ['AIR FRESHNER', 'DISH WASH', 'FOIL', 'SCOURY', 'COLOURS', 'BAKING POWDER', 'DETERGENT', 'CLEANER', 'BLEACH', 'ARIEL', 'OMO', 'SUNLIGHT', 'TISSUE', 'MATCHES', 'JIK'],
  'Canned & Condiments': ['TOMATO', 'KETCHUP', 'MUSTARD', 'SALT', 'SUGAR', 'SPICE', 'VINEGAR', 'SAUCE', 'CURRY', 'MASALA', 'HONEY'],
  'Baby Products': ['BABY', 'DIAPER', 'PAMPERS', 'NAN', 'CERELAC'],
  'Fish & Meat': ['FISH', 'MEAT', 'BEEF', 'CHICKEN', 'SARDINE', 'TUNA'],
};

async function main() {
  console.log('Fetching all items...');
  const items = await (prisma as any).item.findMany({
    select: { id: true, name: true, category: true }
  });

  console.log(`Found ${items.length} items.`);

  let updated = 0;
  let categorized = 0;
  const CHUNK_SIZE = 50;

  for (let i = 0; i < items.length; i += CHUNK_SIZE) {
    const chunk = items.slice(i, i + CHUNK_SIZE);
    await Promise.all(chunk.map(async (item: any) => {
      let targetCategory = 'General';
      const nameUpper = item.name.toUpperCase();

      for (const [category, keywords] of Object.entries(CATEGORY_MAPPING)) {
        if (keywords.some(keyword => nameUpper.includes(keyword))) {
          targetCategory = category;
          break;
        }
      }

      if (targetCategory !== item.category) {
        await (prisma as any).item.update({
          where: { id: item.id },
          data: { category: targetCategory }
        });
        categorized++;
      }
      updated++;
    }));

    if (updated % 100 === 0 || updated === items.length) {
      console.log(`Progress: ${updated}/${items.length} items processed (${categorized} categorized).`);
    }
  }

  console.log(`Successfully updated ${categorized} items with new categories.`);
}

main()
  .catch((e) => {
    console.error('Error categorizing items:', e);
    process.exit(1);
  })
  .finally(async () => {
    await (prisma as any).$disconnect();
  });
