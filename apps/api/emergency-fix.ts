import pg from 'pg';
const { Client } = pg;

async function run() {
    const client = new Client({
        connectionString: 'postgresql://postgres:admin123@localhost:5432/mikrotik_monitor'
    });

    try {
        await client.connect();
        console.log('Connected to database.');

        console.log('Checking for disabled column...');
        const checkRes = await client.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'router_netwatch' 
            AND column_name = 'disabled';
        `);

        if (checkRes.rows.length === 0) {
            console.log('Column missing. Adding it...');
            await client.query('ALTER TABLE router_netwatch ADD COLUMN disabled BOOLEAN DEFAULT false NOT NULL;');
            console.log('Column added successfully.');
        } else {
            console.log('Column already exists.');
        }

    } catch (err) {
        console.error('DATABASE ERROR:', err);
    } finally {
        await client.end();
        console.log('Disconnected.');
    }
}

run();
