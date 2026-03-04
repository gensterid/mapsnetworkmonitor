const { Client } = require('pg');
const fs = require('fs');

async function run() {
    const client = new Client({
        connectionString: 'postgresql://postgres:admin123@localhost:5432/mikrotik_monitor'
    });

    let output = '';
    const log = (msg) => {
        output += msg + '\n';
        console.log(msg);
    };

    try {
        await client.connect();
        log('Connected to database.');

        await client.query('ALTER TABLE router_netwatch ADD COLUMN IF NOT EXISTS disabled BOOLEAN DEFAULT false NOT NULL;');
        log('Migration command executed.');

        const res = await client.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'router_netwatch' AND column_name = 'disabled';");
        log('Verification result: ' + JSON.stringify(res.rows));

    } catch (err) {
        log('ERROR: ' + err.message);
    } finally {
        await client.end();
        fs.writeFileSync('db-fix-log.txt', output);
    }
}

run();
