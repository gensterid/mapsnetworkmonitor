import postgres from 'postgres';
import dotenv from 'dotenv';
import path from 'path';

// Load .env from apps/api
dotenv.config({ path: path.join(process.cwd(), 'apps', 'api', '.env') });

const sql = postgres(process.env.DATABASE_URL!);

async function main() {
    console.log('🚀 Checking and patching routers schema...');

    const columnsToAdd = [
        { name: 'parent_interface', type: 'text' },
        { name: 'gateway_id', type: 'uuid' },
        { name: 'romon_mac', type: 'text' },
        { name: 'last_neighbors_sync', type: 'timestamp' }
    ];

    try {
        for (const col of columnsToAdd) {
            const result = await sql`
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = 'routers' AND column_name = ${col.name}
            `;

            if (result.length > 0) {
                console.log(`✅ Column ${col.name} already exists.`);
            } else {
                console.log(`⚠️ Adding column ${col.name}...`);
                await sql.unsafe(`ALTER TABLE routers ADD COLUMN ${col.name} ${col.type}`);
                console.log(`✅ Column ${col.name} added successfully.`);
            }
        }
    } catch (error) {
        console.error('❌ Error updating routers schema:', error);
    } finally {
        await sql.end();
        console.log('🏁 Patch complete.');
    }
}

main();
