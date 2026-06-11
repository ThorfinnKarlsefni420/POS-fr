const { Pool } = require('pg');
const pool = new Pool({
  connectionString: "postgresql://postgres.jqspqwqvdgibnopumeuj:m9ZVqT.M!5wzYCw@aws-0-eu-west-1.pooler.supabase.com:6543/postgres",
  connectionTimeoutMillis: 10000,
});

pool.query("SELECT id, name, pin FROM \"User\" WHERE role = 'SUPERADMIN' LIMIT 1", (err, res) => {
  if (err) {
    console.error('Query error', err.stack);
  } else {
    console.log('Superadmin:', JSON.stringify(res.rows[0], null, 2));
  }
  pool.end();
});
