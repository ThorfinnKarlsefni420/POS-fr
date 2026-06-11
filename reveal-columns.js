const { Pool } = require('pg');
const pool = new Pool({
  connectionString: "postgresql://postgres.jqspqwqvdgibnopumeuj:m9ZVqT.M!5wzYCw@aws-0-eu-west-1.pooler.supabase.com:6543/postgres",
});

async function run() {
  const res = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'Item'");
  console.log('Columns in Item:', res.rows.map(r => r.column_name));
  await pool.end();
}
run();
