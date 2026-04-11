import postgres from 'postgres';

const sql = postgres('postgresql://postgres:admin123@localhost:5432/mikrotik_monitor');

async function diagnostic() {
  console.log('🔍 Comprehensive Diagnostic...');

  try {
    // 1. Current Routers
    const routers = await sql`SELECT id, name, host, last_error_message FROM routers`;
    console.log('\n--- Routers ---');
    console.table(routers);

    // 2. Netwatch Hosts (The "Mapping")
    const nwCount = await sql`SELECT count(*) FROM router_netwatch`;
    const hostCount = await sql`SELECT count(*) FROM netwatch_hosts`;
    console.log(`\nMapping Data:`);
    console.log(`  - router_netwatch: ${nwCount[0].count} rows`);
    console.log(`  - netwatch_hosts: ${hostCount[0].count} rows`);

    // 3. Check for "Orphan" mappings (if I deleted Genster but mappings stayed)
    const orphans = await sql`
        SELECT id, name, host FROM router_netwatch 
        WHERE router_id NOT IN (SELECT id FROM routers)
    `;
    console.log(`\nOrphan Mappings (Missing Router): ${orphans.length}`);

  } catch (error) {
    console.error('❌ Diagnostic failed:', error);
  } finally {
    process.exit();
  }
}

diagnostic();
