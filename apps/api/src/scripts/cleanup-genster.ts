import postgres from 'postgres';

const sql = postgres('postgresql://postgres:admin123@localhost:5432/mikrotik_monitor');

async function cleanupGenster() {
  console.log('Cleaning up genster router for re-testing...');
  try {
    const res = await sql`DELETE FROM routers WHERE name = 'genster'`;
    console.log(`Router genster deleted successfully (${res.count} row).`);
  } catch (error) {
    console.error('Failed to delete genster:', error);
  } finally {
    process.exit();
  }
}

cleanupGenster();
