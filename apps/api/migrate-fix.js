import pkg from 'pg';
const { Client } = pkg;

async function run() {
    const client = new Client({
        connectionString: 'postgresql://postgres:admin123@localhost:5432/mikrotik_monitor'
    });

    try {
        await client.connect();
        console.log('Connected to database.');

        await client.query('ALTER TABLE router_netwatch ADD COLUMN IF NOT EXISTS disabled BOOLEAN DEFAULT false NOT NULL;');
        console.log('Migration command executed.');

        const res = await client.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'router_netwatch' AND column_name = 'disabled';");
        console.log('Verification result:', res.rows);

    } catch (err) {
        console.log('ERROR:', err.message);
    } finally {
        await client.end();
    }
}

run();
