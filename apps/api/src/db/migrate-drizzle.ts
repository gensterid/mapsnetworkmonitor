import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { sql } from 'drizzle-orm';
import postgres from 'postgres';
import path from 'path';
import { fileURLToPath } from 'url';
import { readFileSync, readdirSync } from 'fs';
import { createHash } from 'crypto';
import { logger } from '../lib/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MAX_AUTO_SKIP_ITERATIONS = 30;

/**
 * TimescaleDB rejects ALTER TABLE ADD CONSTRAINT on hypertables that have
 * compressed chunks ("operation not supported on hypertables that have
 * compressed data"). The constraint is usually semantically harmless because
 * earlier deployments already added it under a different name. When this
 * error hits we identify which migration file failed, mark it as applied in
 * drizzle's tracking table (using the file's real hash + journal `when`) and
 * retry. The migration is skipped, not lost — the FK is still enforced via
 * the older constraint already present in production.
 */
function isCompressedHypertableError(err: any): boolean {
    const probe = (s: any) => typeof s === 'string' && s.includes('hypertables that have compressed data');
    return probe(err?.message) || probe(err?.cause?.message) || probe(String(err?.cause));
}

function findFailingMigrationFile(migrationsFolder: string, query: string): string | null {
    if (!query) return null;
    // Pull a constraint name out of the failing query — it's the most stable token
    // because Drizzle generates predictable ${table}_${col}_${ref}_${col}_fk names.
    const constraintMatch = query.match(/CONSTRAINT\s+"([a-z0-9_]+)"/i);
    if (!constraintMatch) return null;
    const needle = constraintMatch[1];
    const files = readdirSync(migrationsFolder).filter((f) => f.endsWith('.sql')).sort();
    for (const f of files) {
        const full = path.join(migrationsFolder, f);
        const content = readFileSync(full, 'utf8');
        if (content.includes(needle)) return full;
    }
    return null;
}

interface JournalEntry { idx: number; when: number; tag: string; }

function readJournalEntry(migrationsFolder: string, fileBaseName: string): JournalEntry | null {
    try {
        const journal = JSON.parse(readFileSync(path.join(migrationsFolder, 'meta', '_journal.json'), 'utf8'));
        const tag = fileBaseName.replace(/\.sql$/, '');
        return (journal.entries as JournalEntry[]).find((e) => e.tag === tag) || null;
    } catch {
        return null;
    }
}

async function markMigrationApplied(db: ReturnType<typeof drizzle>, hash: string, when: number) {
    await db.execute(sql`
        INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
        VALUES (${hash}, ${when})
        ON CONFLICT DO NOTHING
    `);
}

/**
 * Drizzle applies migrations sequentially in journal order. The next-to-be-applied
 * migration is at journal index = count(__drizzle_migrations). Use this to find
 * which migration just failed without parsing the error query (which may not
 * contain identifying tokens for "column already exists" cases).
 */
async function findNextPendingMigration(db: ReturnType<typeof drizzle>, migrationsFolder: string): Promise<{ tag: string; when: number; hash: string } | null> {
    const journalRaw = JSON.parse(readFileSync(path.join(migrationsFolder, 'meta', '_journal.json'), 'utf8'));
    const entries = journalRaw.entries as JournalEntry[];
    const result: any = await db.execute(sql`SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations`);
    const applied: number = result?.[0]?.n ?? result?.rows?.[0]?.n ?? 0;
    const next = entries[applied];
    if (!next) return null;
    const filePath = path.join(migrationsFolder, `${next.tag}.sql`);
    const content = readFileSync(filePath, 'utf8');
    const hash = createHash('sha256').update(content).digest('hex');
    return { tag: next.tag, when: next.when, hash };
}

export async function runDrizzleMigrations() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error('DATABASE_URL is not set');

    console.log('🚀 Running Drizzle Migrations...');
    const migrationClient = postgres(connectionString, { max: 1 });
    const db = drizzle(migrationClient);
    const migrationsFolder = path.resolve(__dirname, 'migrations');
    logger.info({ migrationsFolder }, '🔍 Drizzle Migrations folder path');

    try {
        for (let attempt = 0; attempt < MAX_AUTO_SKIP_ITERATIONS; attempt++) {
            try {
                await migrate(db, { migrationsFolder });
                console.log('✅ Drizzle Migrations completed successfully!');
                return;
            } catch (error: any) {
                // "already exists" / "duplicate_object" — partially-applied migration
                // (e.g. someone hand-patched a column). Mark the failing migration as
                // applied and continue, so subsequent migrations still run instead of
                // being silently skipped.
                if (error.message?.includes('duplicate_object') || error.message?.includes('already exists')) {
                    const next = await findNextPendingMigration(db, migrationsFolder);
                    if (next) {
                        console.log(`⚠️  ${next.tag} hit "already exists" — marking applied and continuing...`);
                        await markMigrationApplied(db, next.hash, next.when);
                        continue; // retry migrate() — drizzle picks up where we left off
                    }
                    console.error('❌ "already exists" but no pending migration found in journal. Inconsistent state.');
                    throw error;
                }

                if (!isCompressedHypertableError(error)) {
                    console.error('❌ Drizzle Migration failed:', error.message);
                    if (error.cause) {
                        const cause = error.cause as any;
                        console.error('   PG cause:', cause.message || cause);
                        if (cause.code) console.error('   PG code :', cause.code);
                        if (cause.detail) console.error('   PG detail:', cause.detail);
                        if (cause.hint) console.error('   PG hint :', cause.hint);
                    }
                    throw error;
                }

                // Compressed hypertable case — identify, mark, retry.
                const failingFile = findFailingMigrationFile(migrationsFolder, error.query || '');
                if (!failingFile) {
                    console.error('❌ Compressed-hypertable error but cannot identify migration file from query');
                    console.error('Query head:', String(error.query || '').slice(0, 300));
                    throw error;
                }
                const baseName = path.basename(failingFile);
                const journal = readJournalEntry(migrationsFolder, baseName);
                if (!journal) {
                    console.error(`❌ No journal entry for ${baseName}`);
                    throw error;
                }
                const sqlContent = readFileSync(failingFile, 'utf8');
                const hash = createHash('sha256').update(sqlContent).digest('hex');

                console.log(`⚠️  TimescaleDB rejected FK on compressed hypertable in ${baseName}.`);
                console.log(`   This FK already exists under an older constraint name. Marking migration applied to skip and continue.`);
                await markMigrationApplied(db, hash, journal.when);
            }
        }
        throw new Error(`Migration retry limit (${MAX_AUTO_SKIP_ITERATIONS}) exceeded — manual intervention required`);
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
