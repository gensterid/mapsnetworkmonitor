
import { execFile } from 'child_process';
import path from 'path';
import fs from 'fs';
import { promisify } from 'util';
import { sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { logger } from '../lib/logger.js';

const execFileAsync = promisify(execFile);

export class BackupService {
    private dbUrl: string;
    private pgDumpPath: string;
    private psqlPath: string;

    constructor() {
        this.dbUrl = process.env.DATABASE_URL!;
        // Allow overriding path via env, default to command name (assumes in PATH)
        this.pgDumpPath = process.env.PG_DUMP_PATH || 'pg_dump';
        this.psqlPath = process.env.PSQL_PATH || 'psql';
    }

    async exportDatabase(isAuto: boolean = false, persistent: boolean = false): Promise<string> {
        // First check if pg_dump is available
        try {
            await execFileAsync(this.pgDumpPath, ['--version']);
        } catch {
            throw new Error('pg_dump not found. Please install PostgreSQL client tools. On Ubuntu: sudo apt install postgresql-client');
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        // Prefix decides RETENTION policy, not just naming:
        //  - 'manual-bkp-' (persistent): operator-triggered snapshot kept in
        //     backups/ and NEVER auto-deleted — cleanupOldBackups() only targets
        //     'auto-bkp-'. Operator prunes these manually (e.g. pre-migration).
        //  - 'auto-bkp-'  (scheduled):   rotated by cleanupOldBackups (age + count cap).
        //  - 'backup-'    (download):    ephemeral one-off export, written to temp/.
        const prefix = persistent ? 'manual-bkp-' : isAuto ? 'auto-bkp-' : 'backup-';
        const filename = `${prefix}${timestamp}.sql.gz`;
        const dir = (isAuto || persistent) ? path.join(process.cwd(), 'backups') : path.join(process.cwd(), 'temp');
        const outputPath = path.join(dir, filename);

        // Ensure dir exists
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        // Command arguments for pg_dump.
        // NOTE: --compress=<algo>:<level> syntax only exists in pg_dump 16+.
        // We use --compress=<level> (0-9) which works from pg_dump 9.3+ up.
        const args = [
            this.dbUrl,
            '--clean',
            '--if-exists',
            '--no-owner',
            '--no-acl',
            '--format=plain',
            '--compress=9',
            '-f',
            outputPath,
        ];

        try {
            const startedAt = Date.now();
            const { stdout, stderr } = await execFileAsync(this.pgDumpPath, args, {
                maxBuffer: 200 * 1024 * 1024, // 200MB buffer for large dumps
            });
            const durationMs = Date.now() - startedAt;
            let sizeBytes = 0;
            try { sizeBytes = fs.statSync(outputPath).size; } catch { /* ignore */ }
            logger.info({
                file: filename,
                sizeBytes,
                durationMs,
                isAuto,
                stderrSnippet: stderr ? String(stderr).slice(0, 200) : undefined,
            }, '💾 Database backup written');

            // Only rotate scheduled auto backups. Persistent manual snapshots
            // use a different prefix and are exempt — never trigger rotation.
            if (isAuto && !persistent) {
                await this.cleanupOldBackups();
            }

            return outputPath;
        } catch (error: any) {
            // Surface the actual pg_dump stderr so operators can see WHY the
            // dump failed (missing tools, permission denied, bad connection).
            const stderr = error?.stderr ? String(error.stderr).slice(0, 500) : undefined;
            logger.error({
                err: error?.message || String(error),
                code: error?.code,
                stderr,
                outputPath,
                isAuto,
            }, 'Backup failed');
            // Clean up empty/incomplete file so it doesn't linger
            try { if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath); } catch { /* ignore */ }
            throw new Error('Failed to create database backup: ' + (error.message || 'Unknown error'));
        }
    }

    async automatedBackup(): Promise<string | null> {
        // Prune old backups FIRST — before attempting the dump. This runs on
        // every scheduled tick regardless of whether today's backup exists or
        // the dump later fails, which breaks the death spiral where a full disk
        // makes the dump fail so the post-dump cleanup never runs — leaving the
        // disk full forever (exactly how CT206 filled up: backups stopped, old
        // files never pruned).
        await this.cleanupOldBackups();

        // Skip jika sudah ada auto backup hari ini — mencegah triplikasi saat
        // PM2 reload beberapa kali dalam sehari.
        const dir = path.join(process.cwd(), 'backups');
        if (fs.existsSync(dir)) {
            const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
            const existsToday = fs.readdirSync(dir).some(f => f.startsWith(`auto-bkp-${today}`));
            if (existsToday) {
                logger.info({ today }, '⏭️  Skipping automated backup — file for today already exists');
                return null;
            }
        }
        logger.info('Starting scheduled automated backup...');
        return this.exportDatabase(true);
    }

    async listBackups(): Promise<any[]> {
        const dir = path.join(process.cwd(), 'backups');
        if (!fs.existsSync(dir)) return [];

        const files = fs.readdirSync(dir);
        const backups = files
            .filter(f => f.endsWith('.sql') || f.endsWith('.sql.gz'))
            .map(f => {
                const filePath = path.join(dir, f);
                const stats = fs.statSync(filePath);
                return {
                    filename: f,
                    size: stats.size,
                    createdAt: stats.birthtime
                };
            })
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

        return backups;
    }

    async deleteBackup(filename: string): Promise<void> {
        // Security: Strip path traversal sequences (e.g. ../../.env)
        const sanitized = path.basename(filename);
        const backupsDir = path.resolve(process.cwd(), 'backups');
        const filePath = path.resolve(backupsDir, sanitized);

        // Verify resolved path is still within backups directory
        if (!filePath.startsWith(backupsDir)) {
            logger.warn({ filename, resolved: filePath }, '🚨 Path traversal attempt blocked on backup delete');
            throw new Error('Invalid backup filename');
        }

        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            logger.info({ filename: sanitized }, 'Backup file deleted');
        }
    }

    async restoreFromHistory(filename: string): Promise<void> {
        // Security: Strip path traversal sequences
        const sanitized = path.basename(filename);
        const backupsDir = path.resolve(process.cwd(), 'backups');
        const filePath = path.resolve(backupsDir, sanitized);

        // Verify resolved path is still within backups directory
        if (!filePath.startsWith(backupsDir)) {
            logger.warn({ filename, resolved: filePath }, '🚨 Path traversal attempt blocked on backup restore');
            throw new Error('Invalid backup filename');
        }

        if (!fs.existsSync(filePath)) {
            throw new Error('Backup file not found');
        }
        return this.importDatabase(filePath);
    }

    private async cleanupOldBackups(): Promise<void> {
        const dir = path.join(process.cwd(), 'backups');
        if (!fs.existsSync(dir)) return;

        // Read retention from settings (any tenant — backup file is global). Default 7 days.
        let retentionDays = 7;
        try {
            // settingsService import is avoided here to keep backup.service free of cycles.
            // We read the global default via a quick query instead.
            const { db } = await import('../db/index.js');
            const { sql: dsql } = await import('drizzle-orm');
            const [row] = await db.execute(dsql`
                SELECT value FROM app_settings
                WHERE key = 'backups_retention_days'
                ORDER BY tenant_id NULLS FIRST LIMIT 1
            `) as any[];
            const parsed = parseInt(String(row?.value ?? '').replace(/"/g, ''), 10);
            if (Number.isFinite(parsed) && parsed > 0) retentionDays = parsed;
        } catch { /* fallback to default */ }

        try {
            const files = fs.readdirSync(dir);
            const now = Date.now();
            const MAX_AGE = retentionDays * 24 * 60 * 60 * 1000;
            let deletedCount = 0;

            for (const file of files) {
                // ONLY target automated backups to avoid accidental loss of manual backups
                if (!file.startsWith('auto-bkp-')) continue;

                try {
                    const filePath = path.join(dir, file);
                    const stats = fs.statSync(filePath);
                    
                    // ON LINUX/LXC: mtime is always more reliable for last modified tracking
                    const age = now - stats.mtime.getTime();

                    if (age > MAX_AGE) {
                        fs.unlinkSync(filePath);
                        logger.info({ file, ageDays: Math.floor(age / (1000 * 60 * 60 * 24)) }, '🧹 Cleaned up old automated backup');
                        deletedCount++;
                    }
                } catch (err: any) {
                    logger.warn({ file, error: err.message }, 'Failed to process individual backup for cleanup');
                }
            }

            // Hard count cap — independent of the age retention. Each dump is
            // GiB-scale, so an age-only policy set too high (e.g. 90 days) can
            // fill the disk long before files age out. Keep only the newest N
            // auto-backups; delete the rest regardless of age. Re-read the dir
            // because the age pass above may have already removed some files.
            const MAX_KEEP = 7;
            const remaining = fs.readdirSync(dir)
                .filter(f => f.startsWith('auto-bkp-'))
                .map(f => {
                    try { return { file: f, mtime: fs.statSync(path.join(dir, f)).mtime.getTime() }; }
                    catch { return null; }
                })
                .filter((x): x is { file: string; mtime: number } => x !== null)
                .sort((a, b) => b.mtime - a.mtime);
            for (let i = MAX_KEEP; i < remaining.length; i++) {
                try {
                    fs.unlinkSync(path.join(dir, remaining[i].file));
                    logger.info({ file: remaining[i].file, reason: 'over-count-cap' }, '🧹 Cleaned up backup over count cap');
                    deletedCount++;
                } catch (err: any) {
                    logger.warn({ file: remaining[i].file, error: err.message }, 'Failed to delete backup over count cap');
                }
            }

            if (deletedCount > 0) {
                logger.info({ deletedCount }, `✅ Automated backup cleanup complete. Deleted ${deletedCount} old files.`);
            }
        } catch (error: any) {
            logger.error({ error: error.message }, 'Failed to run backup cleanup');
        }
    }

    async importDatabase(filePath: string): Promise<void> {
        // Try psql first
        try {
            await execFileAsync(this.psqlPath, ['--version']);
            // psql is available, use it
            const args = [this.dbUrl, '-f', filePath];
            await execFileAsync(this.psqlPath, args);
            return;
        } catch {
            // psql not available, fallback to JavaScript implementation
            logger.info('psql not found, using JavaScript SQL executor...');
        }

        // JavaScript fallback: read and execute SQL statements
        // Security: Limit JS fallback to files under 50MB to prevent OOM
        const MAX_JS_RESTORE_SIZE = 50 * 1024 * 1024; // 50MB
        try {
            const stats = fs.statSync(filePath);
            if (stats.size > MAX_JS_RESTORE_SIZE) {
                throw new Error(
                    `Backup file too large for JavaScript restore (${Math.round(stats.size / 1024 / 1024)}MB). ` +
                    `Please install PostgreSQL client tools (psql) on the server, or use the CLI restore script: ./scripts/restore-db.sh`
                );
            }
            const sqlContent = fs.readFileSync(filePath, 'utf-8');
            await this.executeSqlStatements(sqlContent);
        } catch (error: any) {
            logger.error({ error }, 'Restore failed');
            throw new Error('Failed to restore database backup: ' + (error.message || 'Unknown error'));
        }
    }

    private async executeSqlStatements(sqlContent: string): Promise<void> {
        // Split SQL content into individual statements
        // Handle multi-line statements by splitting on semicolons followed by newlines
        const statements = this.parseSqlStatements(sqlContent);

        logger.info(`Executing ${statements.length} SQL statements...`);

        let executed = 0;
        let skipped = 0;
        let errors = 0;

        for (const statement of statements) {
            const trimmed = statement.trim();
            if (!trimmed) continue;

            // Skip certain statements that might cause issues
            if (this.shouldSkipStatement(trimmed)) {
                skipped++;
                continue;
            }

            try {
                await db.execute(sql.raw(trimmed));
                executed++;
            } catch (error: any) {
                // Log but continue - some errors are expected (like dropping non-existent tables)
                const errorMsg = error.message || '';

                // Ignore common non-critical errors
                if (errorMsg.includes('does not exist') ||
                    errorMsg.includes('already exists') ||
                    errorMsg.includes('duplicate key') ||
                    errorMsg.includes('violates foreign key')) {
                    skipped++;
                    continue;
                }

                logger.warn(`Warning executing SQL: ${errorMsg.substring(0, 100)}`);
                errors++;
            }
        }

        logger.info(`Restore complete: ${executed} executed, ${skipped} skipped, ${errors} errors`);
    }

    private parseSqlStatements(sqlContent: string): string[] {
        const statements: string[] = [];
        let current = '';
        let inString = false;
        let stringChar = '';
        let inDollarQuote = false;
        let dollarTag = '';

        for (let i = 0; i < sqlContent.length; i++) {
            const char = sqlContent[i];
            const nextChar = sqlContent[i + 1] || '';

            // Handle dollar quoting (common in PostgreSQL functions)
            if (!inString && char === '$') {
                const match = sqlContent.substring(i).match(/^\$[a-zA-Z0-9_]*\$/);
                if (match) {
                    if (!inDollarQuote) {
                        inDollarQuote = true;
                        dollarTag = match[0];
                    } else if (match[0] === dollarTag) {
                        inDollarQuote = false;
                        dollarTag = '';
                    }
                    current += match[0];
                    i += match[0].length - 1;
                    continue;
                }
            }

            // Handle regular strings
            if (!inDollarQuote && (char === "'" || char === '"')) {
                if (!inString) {
                    inString = true;
                    stringChar = char;
                } else if (char === stringChar) {
                    // Check for escaped quote
                    if (nextChar === char) {
                        current += char;
                        i++;
                    } else {
                        inString = false;
                        stringChar = '';
                    }
                }
            }

            current += char;

            // Statement terminator
            if (char === ';' && !inString && !inDollarQuote) {
                statements.push(current.trim());
                current = '';
            }
        }

        // Don't forget the last statement if it doesn't end with semicolon
        if (current.trim()) {
            statements.push(current.trim());
        }

        return statements;
    }

    private shouldSkipStatement(statement: string): boolean {
        const upper = statement.toUpperCase();

        // Skip PostgreSQL-specific commands that might not work
        const skipPatterns = [
            /^--/,                          // Comments
            /^SET /i,                        // SET commands
            /^SELECT pg_catalog\./i,         // pg_catalog functions
            /^COMMENT ON/i,                  // Comments on objects (optional)
            /^\\connect/i,                   // psql meta-commands
            /^\\set/i,
            /^\\echo/i,
        ];

        for (const pattern of skipPatterns) {
            if (pattern.test(statement)) {
                return true;
            }
        }

        // Block dangerous DDL/DCL statements that should never appear in a legitimate backup restore
        const blockedPatterns = [
            /^DROP\s+DATABASE\b/i,
            /^DROP\s+SCHEMA\b/i,
            /^TRUNCATE\b/i,
            /^CREATE\s+ROLE\b/i,
            /^ALTER\s+ROLE\b/i,
            /^DROP\s+ROLE\b/i,
            /^GRANT\b/i,
            /^REVOKE\b/i,
            /^ALTER\s+SYSTEM\b/i,
            /^COPY\b.*\bFROM\s+PROGRAM\b/i,
            /\bpg_read_file\b/i,
            /\bpg_execute_server_program\b/i,
        ];

        for (const pattern of blockedPatterns) {
            if (pattern.test(statement)) {
                logger.warn({ statement: statement.substring(0, 100) }, 'Backup restore: Blocked dangerous SQL statement');
                return true;
            }
        }

        return false;
    }
}

export const backupService = new BackupService();
