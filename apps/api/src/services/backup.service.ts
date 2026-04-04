
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

    async exportDatabase(isAuto: boolean = false): Promise<string> {
        // First check if pg_dump is available
        try {
            await execFileAsync(this.pgDumpPath, ['--version']);
        } catch {
            throw new Error('pg_dump not found. Please install PostgreSQL client tools. On Ubuntu: sudo apt install postgresql-client');
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = isAuto ? `auto-bkp-${timestamp}.sql.gz` : `backup-${timestamp}.sql.gz`;
        const dir = isAuto ? path.join(process.cwd(), 'backups') : path.join(process.cwd(), 'temp');
        const outputPath = path.join(dir, filename);

        // Ensure dir exists
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        // Command arguments for pg_dump
        const args = [
            this.dbUrl,
            '--clean',
            '--if-exists',
            '--no-owner',
            '--no-acl',
            '--format=plain', // Plain format but we compress it
            '--compress=gzi:9', // Max GZIP compression
            '-f',
            outputPath
        ];

        try {
            await execFileAsync(this.pgDumpPath, args);

            if (isAuto) {
                await this.cleanupOldBackups();
            }

            return outputPath;
        } catch (error: any) {
            logger.error({ error }, 'Backup failed');
            throw new Error('Failed to create database backup: ' + (error.message || 'Unknown error'));
        }
    }

    async automatedBackup(): Promise<string> {
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

        try {
            const files = fs.readdirSync(dir);
            const now = Date.now();
            const MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days
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

        return false;
    }
}

export const backupService = new BackupService();
