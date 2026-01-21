
import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';
import { promisify } from 'util';
import { sql } from 'drizzle-orm';
import { db } from '../db/index.js';

const execAsync = promisify(exec);

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

    async exportDatabase(): Promise<string> {
        // First check if pg_dump is available
        try {
            await execAsync(`"${this.pgDumpPath}" --version`);
        } catch {
            throw new Error('pg_dump not found. Please install PostgreSQL client tools. On Ubuntu: sudo apt install postgresql-client');
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `backup-${timestamp}.sql`;
        const outputPath = path.join(process.cwd(), 'temp', filename);

        // Ensure temp dir exists
        if (!fs.existsSync(path.join(process.cwd(), 'temp'))) {
            fs.mkdirSync(path.join(process.cwd(), 'temp'));
        }

        // Command: pg_dump "postgres://..." > output.sql
        // Using --clean --if-exists to ensure restore overwrites properly
        const command = `"${this.pgDumpPath}" "${this.dbUrl}" --clean --if-exists --no-owner --no-acl > "${outputPath}"`;

        try {
            await execAsync(command);
            return outputPath;
        } catch (error: any) {
            console.error('Backup failed:', error);
            throw new Error('Failed to create database backup: ' + (error.message || 'Unknown error'));
        }
    }

    async importDatabase(filePath: string): Promise<void> {
        // Try psql first
        try {
            await execAsync(`"${this.psqlPath}" --version`);
            // psql is available, use it
            const command = `"${this.psqlPath}" "${this.dbUrl}" < "${filePath}"`;
            await execAsync(command);
            return;
        } catch {
            // psql not available, fallback to JavaScript implementation
            console.log('psql not found, using JavaScript SQL executor...');
        }

        // JavaScript fallback: read and execute SQL statements
        try {
            const sqlContent = fs.readFileSync(filePath, 'utf-8');
            await this.executeSqlStatements(sqlContent);
        } catch (error: any) {
            console.error('Restore failed:', error);
            throw new Error('Failed to restore database backup: ' + (error.message || 'Unknown error'));
        }
    }

    private async executeSqlStatements(sqlContent: string): Promise<void> {
        // Split SQL content into individual statements
        // Handle multi-line statements by splitting on semicolons followed by newlines
        const statements = this.parseSqlStatements(sqlContent);

        console.log(`Executing ${statements.length} SQL statements...`);

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

                console.warn(`Warning executing SQL: ${errorMsg.substring(0, 100)}`);
                errors++;
            }
        }

        console.log(`Restore complete: ${executed} executed, ${skipped} skipped, ${errors} errors`);
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
