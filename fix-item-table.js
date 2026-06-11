const { Pool } = require('pg');
const pool = new Pool({
  connectionString: "postgresql://postgres.jqspqwqvdgibnopumeuj:m9ZVqT.M!5wzYCw@aws-0-eu-west-1.pooler.supabase.com:6543/postgres",
});

async function run() {
  try {
    const res = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'Item' AND column_name = 'supplierId'");
    if (res.rows.length === 0) {
      console.log('Adding supplierId to Item table...');
      await pool.query('ALTER TABLE "Item" ADD COLUMN "supplierId" TEXT');
      await pool.query('ALTER TABLE "Item" ADD CONSTRAINT "Item_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE');
      console.log('supplierId added successfully.');
    } else {
      console.log('supplierId already exists in Item table.');
    }
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}
run();
