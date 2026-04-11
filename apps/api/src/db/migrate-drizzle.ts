import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from '../lib/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function runDrizzleMigrations() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
        throw new Error('DATABASE_URL is not set');
    }

    console.log('🚀 Running Drizzle Migrations...');
    
    // Migrations should use a single connection
    const migrationClient = postgres(connectionString, { max: 1 });
    const db = drizzle(migrationClient);

    const migrationsFolder = path.resolve(__dirname, 'migrations');
    logger.info({ migrationsFolder }, '🔍 Drizzle Migrations folder path');

    try {
        await migrate(db, {
            migrationsFolder,
        });
        console.log('✅ Drizzle Migrations completed successfully!');
    } catch (error: any) {
        // Silently ignore 'duplicate_object' errors which are common in manual TimescaleDB schema fixes
        if (error.message?.includes('duplicate_object') || error.message?.includes('already exists')) {
            console.log('⚠️ Drizzle Migration: Some objects already exist, skipping duplicates...');
            return;
        }
        
        console.error('❌ Drizzle Migration failed:', error.message);
        // Don't exit process here, let the caller handle it
        throw error;
    } finally {
        await migrationClient.end();
    }
}

// Allow running directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    runDrizzleMigrations()
        .then(() => process.exit(0))
        .catch(() => process.exit(1));
}
