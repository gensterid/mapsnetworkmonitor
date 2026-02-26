import { db } from './src/db/index.js';
import { sql } from 'drizzle-orm';

async function check() {
    const tables = ['tenants', 'users', 'routers', 'router_netwatch', 'onus', 'olts', 'app_settings'];
    for (const t of tables) {
        try {
            const [r] = await db.execute(sql.raw('SELECT count(*) FROM ' + t));
            console.log(t + ':', r.count);
        } catch (e) {
            console.log(t + ': Error - ' + e.message);
        }
    }
    process.exit(0);
}

check();
