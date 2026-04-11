import postgres from 'postgres';

const sql = postgres('postgresql://postgres:admin123@localhost:5432/mikrotik_monitor');

async function cleanup() {
  console.log('Cleaning up stale alerts...');
  try {
    const res = await sql`
      UPDATE alerts 
      SET acknowledged = true, acknowledged_at = NOW(), acknowledged_by = NULL 
      WHERE resolved = true AND acknowledged = false
    `;
    console.log(`Acknowledged ${res.count} resolved alerts.`);
  } catch (error) {
    console.error('Failed to cleanup:', error);
  } finally {
    process.exit();
  }
}

cleanup();
