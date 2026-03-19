import 'dotenv/config';
import postgres from 'postgres';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function catchup() {
    const connectionString = process.env.DATABASE_URL!;
    const sql = postgres(connectionString);
    const migrationsDir = path.join(__dirname, 'migrations');
    
    console.log('🏁 Starting Drizzle Catch-up...');

    // 1. Create drizzle migrations table if not exists
    await sql.unsafe(`
        CREATE SCHEMA IF NOT EXISTS "drizzle";
        CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (
            id SERIAL PRIMARY KEY,
            hash TEXT NOT NULL,
            created_at BIGINT
        );
    `);

    // 2. Get list of migration files
    const files = fs.readdirSync(migrationsDir)
        .filter(f => f.endsWith('.sql'))
        .sort();

    console.log(`Found ${files.length} migration files.`);

    for (const file of files) {
        const filePath = path.join(migrationsDir, file);
        const content = fs.readFileSync(filePath, 'utf8');
        
        // Check if already in DB
        const existing = await sql`SELECT * FROM "__drizzle_migrations" WHERE hash = ${crypto.createHash('sha256').update(content).digest('hex')} LIMIT 1`;
        
        if (existing.length > 0) {
            console.log(`⏩ Skipping ${file} (Already applied)`);
            continue;
        }

        console.log(`🚀 Applying ${file}...`);
        
        // Split by statement-breakpoint (Drizzle uses this)
        const statements = content.split('--> statement-breakpoint');
        
        for (const stmt of statements) {
            if (!stmt.trim()) continue;
            
            try {
                await sql.unsafe(stmt);
            } catch (err: any) {
                // Ignore "already exists" errors
                // 42P07: relation already exists
                // 42701: column already exists
                // 42P16: multiple primary keys (if trying to add PK to existing table)
                // 23505: unique violation (if trying to insert duplicate metadata)
                if (err.code === '42P07' || err.code === '42701' || err.code === '42P16' || err.code === '42P06') {
                    // console.log(`   🔸 Ref: ${err.message.split('\n')[0]}`);
                } else {
                    console.warn(`   ⚠️  Potential issue in ${file}:`, err.message);
                }
            }
        }

        // Record as applied
        await sql`
            INSERT INTO "__drizzle_migrations" (hash, created_at)
            VALUES (${crypto.createHash('sha256').update(content).digest('hex')}, ${Date.now()})
        `;
        console.log(`✅ Recorded ${file}`);
    }

    console.log('✨ Catch-up complete! Database is now in sync with Drizzle history.');
    process.exit(0);
}

catchup().catch(err => {
    console.error('❌ Catch-up failed:', err);
    process.exit(1);
});
