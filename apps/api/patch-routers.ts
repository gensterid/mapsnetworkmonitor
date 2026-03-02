import postgres from 'postgres';
import dotenv from 'dotenv';
import path from 'path';

// Load .env from apps/api
dotenv.config({ path: path.join(process.cwd(), 'apps', 'api', '.env') });

const sql = postgres(process.env.DATABASE_URL!);

async function main() {
    console.log('🚀 Checking and patching routers schema...');

    const routerColumns = [
        { name: 'parent_interface', type: 'text' },
        { name: 'gateway_id', type: 'uuid' },
        { name: 'romon_mac', type: 'text' },
        { name: 'last_neighbors_sync', type: 'timestamp' },
        { name: 'topology_x', type: 'numeric(10,2)' },
        { name: 'topology_y', type: 'numeric(10,2)' }
    ];

    const oltColumns = [
        { name: 'topology_x', type: 'numeric(10,2)' },
        { name: 'topology_y', type: 'numeric(10,2)' }
    ];

    const netwatchColumns = [
        { name: 'topology_x', type: 'numeric(10,2)' },
        { name: 'topology_y', type: 'numeric(10,2)' }
    ];

    try {
        // Patch routers
        for (const col of routerColumns) {
            const result = await sql`
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = 'routers' AND column_name = ${col.name}
            `;

            if (result.length > 0) {
                console.log(`✅ Column ${col.name} already exists in routers.`);
            } else {
                console.log(`⚠️ Adding column ${col.name} to routers...`);
                await sql.unsafe(`ALTER TABLE routers ADD COLUMN ${col.name} ${col.type}`);
                console.log(`✅ Column ${col.name} added to routers successfully.`);
            }
        }

        // Patch olts
        for (const col of oltColumns) {
            const result = await sql`
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = 'olts' AND column_name = ${col.name}
            `;

            if (result.length > 0) {
                console.log(`✅ Column ${col.name} already exists in olts.`);
            } else {
                console.log(`⚠️ Adding column ${col.name} to olts...`);
                await sql.unsafe(`ALTER TABLE olts ADD COLUMN ${col.name} ${col.type}`);
                console.log(`✅ Column ${col.name} added to olts successfully.`);
            }
        }

        // Patch router_netwatch
        for (const col of netwatchColumns) {
            const result = await sql`
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = 'router_netwatch' AND column_name = ${col.name}
            `;

            if (result.length > 0) {
                console.log(`✅ Column ${col.name} already exists in router_netwatch.`);
            } else {
                console.log(`⚠️ Adding column ${col.name} to router_netwatch...`);
                await sql.unsafe(`ALTER TABLE router_netwatch ADD COLUMN ${col.name} ${col.type}`);
                console.log(`✅ Column ${col.name} added to router_netwatch successfully.`);
            }
        }
    } catch (error) {
        console.error('❌ Error updating schemas:', error);
    } finally {
        await sql.end();
        console.log('🏁 Patch complete.');
    }
}

main();
