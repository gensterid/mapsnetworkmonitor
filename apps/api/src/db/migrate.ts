import 'dotenv/config';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigrations() {
    console.log('🚀 Starting database migrations...');

    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
        console.error('❌ DATABASE_URL is not defined in environment variables');
        process.exit(1);
    }

    // Create a one-off connection for migrations
    const migrationClient = postgres(connectionString, { max: 1 });
    const db = drizzle(migrationClient);

    try {
        // Migration folder is relative to this file
        const migrationsPath = path.join(__dirname, 'migrations');
        console.log(`📂 Reading migrations from: ${migrationsPath}`);

        await migrate(db, { migrationsFolder: migrationsPath });

        console.log('✅ Migrations applied successfully!');
    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    } finally {
        await migrationClient.end();
        console.log('🏁 Migration process finished.');
    }
}

runMigrations();
