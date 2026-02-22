const postgres = require('postgres');
require('dotenv').config();

const sql = postgres(process.env.DATABASE_URL);

async function checkHost(host) {
    console.log(`--- Checking Host: ${host} ---`);

    try {
        console.log('Querying router_netwatch...');
        const nwEntries = await sql`SELECT * FROM router_netwatch WHERE host = ${host}`;
        console.log(`Found ${nwEntries.length} Netwatch entries.`);
        console.log('Netwatch Entries:', JSON.stringify(nwEntries, null, 2));

        console.log('Querying onus...');
        const onuEntries = await sql`SELECT * FROM onus WHERE host = ${host}`;
        console.log(`Found ${onuEntries.length} ONU entries.`);
        console.log('ONU Entries:', JSON.stringify(onuEntries, null, 2));

        if (nwEntries.length > 0 && onuEntries.length > 0) {
            const nw = nwEntries[0];
            const routerId = nw.router_id;

            console.log(`\nValidating Join Conditions for Router ID: ${routerId}`);

            const relatedOlts = await sql`SELECT id FROM olts WHERE parent_id = ${routerId}`;
            const oltIds = relatedOlts.map(o => o.id);
            console.log('Related OLT IDs:', oltIds);

            for (const onu of onuEntries) {
                console.log(`ONU SN: ${onu.sn}, OLT ID: ${onu.olt_id}`);
                const isOltMatch = oltIds.includes(onu.olt_id);
                console.log(`OLT Match: ${isOltMatch}`);
            }
        } else {
            console.log('No matching entries found in both tables.');
            if (nwEntries.length === 0) console.log('Netwatch entry missing for this IP.');
            if (onuEntries.length === 0) console.log('ONU/ACS entry missing for this IP.');
        }
    } catch (err) {
        console.error('Database Error:', err);
    } finally {
        await sql.end();
    }
}

const targetHost = process.argv[2] || '10.100.100.12';
checkHost(targetHost);
