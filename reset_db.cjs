const { Client } = require('pg');
require('dotenv').config({ path: 'apps/api/.env' });

const client = new Client({ connectionString: process.env.DATABASE_URL });

async function fix() {
  await client.connect();
  // Clear all errors and set online
  await client.query("UPDATE routers SET status = 'online', last_error_message = null");
  console.log("Database reset to online!");
  await client.end();
  process.exit(0);
}

fix().catch(e => {
  console.error(e);
  process.exit(1);
});
