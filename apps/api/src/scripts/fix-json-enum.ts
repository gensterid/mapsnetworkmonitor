import { sql } from 'drizzle-orm';
import { db } from '../db/index.js';

async function fix() {
    console.log('🛠️ Fixing database: Adding "json" to router_backup_type enum...');
    try {
        // We run this as a raw query. 
        // Note: ALTER TYPE ... ADD VALUE cannot be executed in a DO block or transaction in older PG versions.
        await db.execute(sql`ALTER TYPE router_backup_type ADD VALUE 'json'`);
        console.log('✅ Enum value added successfully!');
    } catch (e: any) {
        if (e.code === '42710' || String(e).includes('already exists')) {
            console.log('ℹ️ Enum value "json" already exists. No action needed.');
        } else {
            console.error('❌ Failed to update enum:', e);
        }
    }
    process.exit(0);
}

fix();
