
import { exec } from 'child_process';
import path from 'path';
import fs from 'fs';
import { promisify } from 'util';


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
        // Command: psql "postgres://..." < input.sql
        const command = `"${this.psqlPath}" "${this.dbUrl}" < "${filePath}"`;

        try {
            await execAsync(command);
        } catch (error) {
            console.error('Restore failed:', error);
            throw new Error('Failed to restore database backup');
        }
    }
}

export const backupService = new BackupService();
