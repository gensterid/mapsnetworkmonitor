import { Client } from 'ssh2';
import path from 'path';
import fs from 'fs';
import { eq, and, desc } from 'drizzle-orm';
import { db } from '../db/index.js';
import { routers, routerBackups } from '../db/schema/index.js';
import { decrypt } from '../lib/encryption.js';
import { logger } from '../lib/logger.js';
import { connectToRouter } from '../lib/mikrotik-api.js';

export class RouterBackupService {
    private backupDir: string;

    constructor() {
        this.backupDir = path.join(process.cwd(), 'backups', 'mikrotik');
        if (!fs.existsSync(this.backupDir)) {
            fs.mkdirSync(this.backupDir, { recursive: true });
        }
    }

    /**
     * Trigger a binary backup (.backup) or export (.rsc) and download via SFTP
     */
    async createBackup(routerId: string, type: 'backup' | 'rsc', comment?: string): Promise<any> {
        const router = await db.query.routers.findFirst({
            where: eq(routers.id, routerId)
        });

        if (!router) throw new Error('Router not found');

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const ext = type === 'backup' ? '.backup' : '.rsc';
        const remoteFilename = `bkp-${router.id}-${timestamp}${ext}`;
        const localPath = path.join(this.backupDir, remoteFilename);

        try {
            // 1. Trigger backup generation on MikroTik via API
            const conn = await connectToRouter({
                host: router.host,
                port: router.port,
                username: router.username,
                password: decrypt(router.passwordEncrypted)
            });
            if (type === 'backup') {
                await conn.write(['/system/backup/save', `=name=${remoteFilename}`]);
            } else {
                await conn.write(['/export', `=file=${remoteFilename}`]);
            }

            // Small delay for file to be ready
            await new Promise(resolve => setTimeout(resolve, 3000));

            // 2. Download via SFTP
            const password = decrypt(router.passwordEncrypted);
            await this.downloadFileViaSftp(router.host, router.username, password, remoteFilename, localPath);

            // 3. Save metadata to DB
            const stats = fs.statSync(localPath);
            const [backupRecord] = await db.insert(routerBackups).values({
                routerId,
                tenantId: router.tenantId!,
                filename: remoteFilename,
                type,
                size: stats.size,
                comment,
                createdAt: new Date()
            }).returning();

            // 4. Cleanup remote file
            try {
                await conn.write(['/file/remove', `=numbers=${remoteFilename}`]);
            } catch (err) {
                logger.warn({ err, remoteFilename }, 'Failed to cleanup remote backup file');
            }

            return backupRecord;
        } catch (error: any) {
            logger.error({ error, routerId }, 'MikroTik backup failed');
            throw new Error(`MikroTik Backup Failed: ${error.message}`);
        }
    }

    /**
     * SFTP Download implementation using ssh2
     */
    private downloadFileViaSftp(host: string, username: string, password: string, remoteFile: string, localPath: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const conn = new Client();
            conn.on('ready', () => {
                conn.sftp((err, sftp) => {
                    if (err) {
                        conn.end();
                        return reject(err);
                    }
                    
                    sftp.fastGet(remoteFile, localPath, (downloadErr) => {
                        conn.end();
                        if (downloadErr) return reject(downloadErr);
                        resolve();
                    });
                });
            }).on('error', (err) => {
                reject(err);
            }).connect({
                host,
                port: 22,
                username,
                password,
                readyTimeout: 10000
            });
        });
    }

    async listRouterBackups(routerId: string) {
        return db.select()
            .from(routerBackups)
            .where(eq(routerBackups.routerId, routerId))
            .orderBy(desc(routerBackups.createdAt));
    }

    async getBackupFileStream(backupId: string) {
        const backup = await db.query.routerBackups.findFirst({
            where: eq(routerBackups.id, backupId)
        });

        if (!backup) throw new Error('Backup record not found');
        const filePath = path.join(this.backupDir, backup.filename);
        if (!fs.existsSync(filePath)) throw new Error('Physical backup file missing');

        return {
            stream: fs.createReadStream(filePath),
            filename: backup.filename,
            size: backup.size
        };
    }

    async deleteBackup(backupId: string) {
        const backup = await db.query.routerBackups.findFirst({
            where: eq(routerBackups.id, backupId)
        });

        if (backup) {
            const filePath = path.join(this.backupDir, backup.filename);
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            await db.delete(routerBackups).where(eq(routerBackups.id, backupId));
        }
    }
}

export const routerBackupService = new RouterBackupService();
