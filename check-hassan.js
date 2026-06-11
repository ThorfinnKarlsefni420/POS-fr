const { Pool } = require('pg');
const pool = new Pool({
  connectionString: "postgresql://postgres.jqspqwqvdgibnopumeuj:m9ZVqT.M!5wzYCw@aws-0-eu-west-1.pooler.supabase.com:6543/postgres",
});

async function run() {
  const users = await pool.query("SELECT * FROM \"User\" WHERE name = 'Hassan'");
  const stores = await pool.query("SELECT * FROM \"Store\" WHERE id = 'store_hasans'");
  console.log('Users:', JSON.stringify(users.rows, null, 2));
  console.log('Stores:', JSON.stringify(stores.rows, null, 2));
  await pool.end();
}
run();
