import path from 'path';
import fs from 'fs';
import { eq, and, desc } from 'drizzle-orm';
import { db } from '../db/index.js';
import { routers, routerBackups } from '../db/schema/index.js';
import { decrypt } from '../lib/encryption.js';
import { logger } from '../lib/logger.js';
import { connectToRouter, safeWrite } from '../lib/mikrotik-api.js';
import { ApiError } from '../middleware/error.middleware.js';
import { routerGroups, tenants as tenantsSchema } from '../db/schema/index.js';

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
     * Trigger a binary backup (.backup) or export (.rsc) and upload via HTTP Push
     */
    async createBackup(routerId: string, type: 'backup' | 'rsc', comment?: string, delay: number = 10): Promise<any> {
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
                // Modified: Added show-sensitive=yes for .rsc exports as requested
                await safeWrite(conn, ['/export', `=file=${remoteFilename}`, '=show-sensitive=yes'], 60000);
            }

            // Delay for file to be ready (user can now customize this)
            logger.info({ routerId, delay }, `Waiting ${delay} seconds for file to be ready...`);
            await new Promise(resolve => setTimeout(resolve, delay * 1000));

            logger.info({ routerId, remoteFilename }, 'Initiating HTTP Push upload from MikroTik...');

            // 2. Instruct MikroTik to push the file to our server via script (more stable for long tasks)
            const baseUrl = process.env.APP_URL || 'http://localhost:3001';
            // Path-based URL to avoid '?' help character issues in MikroTik/Cloudflare
            const uploadUrl = `${baseUrl}/api/router-backups/upload/push/${encodeURIComponent(router.id)}/${encodeURIComponent(token)}/${encodeURIComponent(remoteFilename)}/${encodeURIComponent(type)}`;
            const isHttps = uploadUrl.startsWith('https://');
            
            const scriptName = `upload-${shortId}`;
            const fetchCommand = `/tool fetch url="${uploadUrl}" http-method=post src-path="${remoteFilename}" keep-result=no check-certificate=no mode=${isHttps ? 'https' : 'http'} http-header-field="User-Agent:MikroTik/7.x,Accept:*/*"`;
            
            logger.info({ routerId, scriptName }, 'Creating temporary upload script on MikroTik...');
            
            // Clean up any old script with same name first
            try { await safeWrite(conn, ['/system/script/remove', `=numbers=${scriptName}`], 5000); } catch (e) {}

            await safeWrite(conn, [
                '/system/script/add',
                `=name=${scriptName}`,
                `=source=${fetchCommand}`
            ], 10000);

            logger.info({ routerId, scriptName }, 'Executing upload script...');
            
            // Running the script (we don't wait for completion here as network tasks can be slow)
            await safeWrite(conn, ['/system/script/run', `=number=${scriptName}`], 60000);

            // Give it some time to start the transfer before we delete the script
            await new Promise(resolve => setTimeout(resolve, 5000));
            await safeWrite(conn, ['/system/script/remove', `=numbers=${scriptName}`], 10000);

            logger.info({ routerId }, 'Backup upload command sent successfully');

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
        try {
            logger.info({ routerId, filename, type, bufferSize: fileBuffer.length }, 'Starting backup upload processing');
            
            const router = await db.query.routers.findFirst({
                where: eq(routers.id, routerId)
            });

            if (!router) {
                logger.error({ routerId }, 'Router not found for backup upload');
                throw ApiError.notFound('Router not found');
            }

            // Simple token verification
            const expectedToken = decrypt(router.passwordEncrypted).substring(0, 32); 
            // Note: The token in the URL is actually a hash or a substring for security
            // We'll accept it for now as it's triggered by our own system
            if (expectedToken !== token) {
                logger.warn({ routerId, token, expectedToken }, 'Invalid backup token received');
                throw ApiError.unauthorized('Invalid backup token');
            }
            
            // Ensure directory exists (again, just in case)
            if (!fs.existsSync(this.backupDir)) {
                logger.info({ backupDir: this.backupDir }, 'Creating missing backup directory');
                fs.mkdirSync(this.backupDir, { recursive: true });
            }

            const localPath = path.join(this.backupDir, filename);
            const absolutePath = path.resolve(localPath);
            
            logger.debug({ absolutePath }, 'Target backup file path');

            try {
                fs.writeFileSync(localPath, fileBuffer);
                logger.info({ filename, size: fileBuffer.length }, 'File written to disk successfully');
            } catch (fsErr: any) {
                logger.error({ 
                    err: fsErr.message, 
                    code: fsErr.code, 
                    path: absolutePath,
                    cwd: process.cwd()
                }, 'Failed to write backup file to disk');
                throw ApiError.internal(`File system error: ${fsErr.message} at ${absolutePath}`);
            }

            const stats = fs.statSync(localPath);
            
            // Ensure we have a tenantId (required by DB schema constraint)
        let finalTenantId = router.tenantId;
        
        if (!finalTenantId) {
            logger.warn({ routerId, filename }, 'Router record missing tenantId, attempting fallback lookup...');
            
            // 1. Try to inherit from Group
            if (router.groupId) {
                const group = await db.query.routerGroups.findFirst({
                    where: eq(routerGroups.id, router.groupId)
                });
                if (group?.tenantId) {
                    finalTenantId = group.tenantId;
                    logger.info({ routerId, tenantId: finalTenantId }, 'Inherited tenantId from router group');
                }
            }
            
            // 2. Fallback to any available tenant (crash prevention in single-tenant/incomplete migrations)
            if (!finalTenantId) {
                const [firstTenant] = await db.select({ id: tenantsSchema.id }).from(tenantsSchema).limit(1);
                if (firstTenant) {
                    finalTenantId = firstTenant.id;
                    logger.info({ routerId, tenantId: finalTenantId }, 'Fallback to first available system tenant');
                }
            }
        }

        if (!finalTenantId) {
            logger.error({ routerId, filename }, 'FATAL: No tenantId found for backup record. Insert will fail.');
            throw ApiError.internal('Internal Configuration Error: Router has no tenant assignment');
        }

        try {
            const [backupRecord] = await db.insert(routerBackups).values({
                routerId,
                tenantId: finalTenantId,
                filename,
                type,
                size: stats.size,
                createdAt: new Date()
            }).returning();
            
            logger.info({ routerId, backupId: backupRecord.id, size: stats.size }, 'Successfully saved MikroTik backup record');
            
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
                logger.info({ routerId, filename }, 'Successfully cleaned up remote backup file on MikroTik');
            } catch (err: any) {
                logger.warn({ err: err.message, filename }, 'Failed to cleanup remote backup file after upload');
            }

            return backupRecord;
        } catch (dbErr: any) {
            logger.error({ dbErr: dbErr.message, routerId, filename }, 'Database error while saving backup record');
            throw ApiError.internal(`Failed to save backup record: ${dbErr.message}`);
        }
    } catch (globalErr: any) {
        logger.error({ 
            err: globalErr.message, 
            stack: globalErr.stack, 
            routerId, 
            filename 
        }, 'Global error in handleBackupUpload');
        
        if (globalErr instanceof ApiError) throw globalErr;
        throw ApiError.internal(`System error during backup processing: ${globalErr.message}`);
    }
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
