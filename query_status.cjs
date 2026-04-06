const { Client } = require('pg');
require('dotenv').config({ path: 'apps/api/.env' });

const client = new Client({ connectionString: process.env.DATABASE_URL });

async function query() {
  await client.connect();
  const res = await client.query('SELECT name, status, last_error_message, updated_at FROM routers ORDER BY name');
  console.log(JSON.stringify(res.rows, null, 2));
  await client.end();
  process.exit(0);
}

// Timeout to prevent hanging
setTimeout(() => {
  console.error("Query timed out. Exiting.");
  process.exit(1);
}, 5000);

query().catch(e => {
  console.error(e);
  process.exit(1);
});
