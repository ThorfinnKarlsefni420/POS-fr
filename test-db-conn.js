const { Pool } = require('pg');
const pool = new Pool({
  connectionString: "postgresql://postgres.jqspqwqvdgibnopumeuj:m9ZVqT.M!5wzYCw@aws-0-eu-west-1.pooler.supabase.com:6543/postgres",
  connectionTimeoutMillis: 10000,
});

pool.query('SELECT 1', (err, res) => {
  if (err) {
    console.error('Connection error', err.stack);
  } else {
    console.log('Connected', res.rows);
  }
  pool.end();
});
