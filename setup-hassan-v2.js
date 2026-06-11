const { Pool } = require('pg');
const pool = new Pool({
  connectionString: "postgresql://postgres.jqspqwqvdgibnopumeuj:m9ZVqT.M!5wzYCw@aws-0-eu-west-1.pooler.supabase.com:6543/postgres",
});

async function run() {
  try {
    // 1. Create or Update Store
    await pool.query({
      text: `INSERT INTO "Store" (id, name, slug, "isActive", "createdAt", "updatedAt")
             VALUES ($1, $2, $3, true, NOW(), NOW())
             ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, slug = EXCLUDED.slug`,
      values: ['store_hasans', "Hasan's Store", 'hasans-store']
    });
    console.log('Store store_hasans set up.');

    // 2. Create or Update User Hassan as ADMIN
    await pool.query({
      text: `INSERT INTO "User" (id, name, pin, role, "storeId", "createdAt", "updatedAt")
             VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
             ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role, "storeId" = EXCLUDED."storeId", pin = EXCLUDED.pin`,
      values: ['user_hassan', 'Hassan', '1234', 'ADMIN', 'store_hasans']
    });
    // Delete the other Hassan if exists to avoid confusion
    await pool.query("DELETE FROM \"User\" WHERE name = 'Hassan' AND id != 'user_hassan'");
    console.log('User Hassan set up as ADMIN.');

    // 3. Create Supplier Hassan
    await pool.query({
      text: `INSERT INTO "Supplier" (id, name, "storeId", "isConsignment", "defaultType", "defaultRate", "createdAt", "updatedAt")
             VALUES ($1, $2, $3, true, 'FIXED_COST', 0, NOW(), NOW())
             ON CONFLICT (id) DO UPDATE SET "isConsignment" = true`,
      values: ['supp_hassan', 'Hassan', 'store_hasans']
    });
    console.log('Supplier Hassan set up.');

    // 4. Link User to Supplier
    await pool.query({
      text: `UPDATE "User" SET "supplierId" = $1 WHERE id = $2`,
      values: ['supp_hassan', 'user_hassan']
    });
    console.log('User Hassan linked to Supplier Hassan.');

  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}
run();
