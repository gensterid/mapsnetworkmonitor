import path from 'path';
import fs from 'fs';
import { eq, and, desc } from 'drizzle-orm';
import { db } from '../db/index.js';
import { routers, routerBackups } from '../db/schema/index.js';
import { decrypt } from '../lib/encryption.js';
import { logger } from '../lib/logger.js';
import { connectToRouter, safeWrite } from '../lib/mikrotik-api.js';
import { ApiError } from '../middleware/error.middleware.js';

// Router Backup Service handles creating and managing MikroTik backups using HTTP Push method

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

        if (!router) throw ApiError.notFound('Router not found');
 
        let token = router.webhookSecret;
        if (!token) {
            const { randomBytes } = await import('crypto');
            token = randomBytes(16).toString('hex');
            await db.update(routers).set({ webhookSecret: token }).where(eq(routers.id, routerId));
        }

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0] + '-' + Date.now();
        const ext = type === 'backup' ? '.backup' : '.rsc';
        const shortId = router.id.split('-')[0];
        const remoteFilename = `bkp-${shortId}-${timestamp}${ext}`;
        const localPath = path.join(this.backupDir, remoteFilename);

        try {
            // 1. Trigger backup generation on MikroTik via API
            const conn = await connectToRouter({
                host: router.host,
                port: router.port,
                username: router.username,
                password: decrypt(router.passwordEncrypted)
            });
            if (!conn) throw ApiError.internal('Failed to connect to router API');

            logger.info({ routerId, type, remoteFilename }, 'Generating backup on MikroTik...');
            
            if (type === 'backup') {
                await safeWrite(conn, ['/system/backup/save', `=name=${remoteFilename}`], 30000);
            } else {
                await safeWrite(conn, ['/export', `=file=${remoteFilename}`], 60000);
            }

            // Small delay for file to be ready (some ROS versions return before file is fully flushed)
            await new Promise(resolve => setTimeout(resolve, 3000));

            logger.info({ routerId, remoteFilename }, 'Initiating HTTP Push upload from MikroTik...');

            // 2. Instruct MikroTik to push the file to our server via HTTP
            const baseUrl = process.env.APP_URL || 'http://localhost:3001';
            const uploadUrl = `${baseUrl}/api/router-backups/upload?routerId=${encodeURIComponent(router.id)}&token=${encodeURIComponent(token)}&filename=${encodeURIComponent(remoteFilename)}&type=${encodeURIComponent(type)}`;
            
            // Determine mode from URL
            const isHttps = uploadUrl.startsWith('https://');

            await safeWrite(conn, [
                '/tool/fetch',
                `=url=${uploadUrl}`,
                '=http-method=post', // Keep http-method but remove timeout
                `=src-path=${remoteFilename}`,
                '=keep-result=no',
                '=check-certificate=no',
                `=mode=${isHttps ? 'https' : 'http'}`
            ], 120000); // 120s timeout for the command execution

            // Note: The actual backup record creation will happen in the upload endpoint
            // when the file is successfully received.
            
            // 3. Cleanup remote file is handled by keep-result=no usually, but we can double check
            // Actually, keep-result=no is for the FETCH result, not the src-path.
            // We should cleanup after upload, but we don't know when it's done here.
            // The upload endpoint will handle cleanup if we give it the router connection info.
            
            return { message: 'Backup triggered and upload initiated', filename: remoteFilename };
        } catch (error: any) {
            logger.error({ error: error.message, stack: error.stack, routerId }, 'MikroTik backup process failed');
            
            if (error instanceof ApiError) throw error;
            throw ApiError.internal(`MikroTik Backup Failed: ${error.message}`);
        }
    }

    /**
     * Handle incoming backup file upload from MikroTik
     */
    async handleBackupUpload(routerId: string, token: string, filename: string, type: 'backup' | 'rsc', fileBuffer: Buffer) {
        const router = await db.query.routers.findFirst({
            where: eq(routers.id, routerId)
        });

        if (!router) throw ApiError.notFound('Router not found');
        if (router.webhookSecret !== token) throw ApiError.unauthorized('Invalid backup token');

        const localPath = path.join(this.backupDir, filename);
        fs.writeFileSync(localPath, fileBuffer);

        const stats = fs.statSync(localPath);
        const [backupRecord] = await db.insert(routerBackups).values({
            routerId,
            tenantId: router.tenantId!,
            filename,
            type,
            size: stats.size,
            createdAt: new Date()
        }).returning();

        // Cleanup remote file on MikroTik
        try {
            const conn = await connectToRouter({
                host: router.host,
                port: router.port,
                username: router.username,
                password: decrypt(router.passwordEncrypted)
            });
            await conn.write(['/file/remove', `=numbers=${filename}`]);
            conn.close();
        } catch (err) {
            logger.warn({ err, filename }, 'Failed to cleanup remote backup file after upload');
        }

        return backupRecord;
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
