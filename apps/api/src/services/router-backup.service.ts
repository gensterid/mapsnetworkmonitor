import path from 'path';
import fs from 'fs';
import { eq, and, desc } from 'drizzle-orm';
import { db } from '../db/index.js';
import { routers, routerBackups } from '../db/schema/index.js';
import { decrypt, encrypt } from '../lib/encryption.js';
import { logger } from '../lib/logger.js';
import { connectToRouter, safeWrite } from '../lib/mikrotik-api.js';
import { ApiError } from '../middleware/error.middleware.js';
import { routerGroups, tenants as tenantsSchema } from '../db/schema/index.js';
import { Client as FtpClient } from 'basic-ftp';

// Router Backup Service handles creating and managing MikroTik backups using HTTP Push method

export class RouterBackupService {
    private backupDir: string;

    constructor() {
        this.backupDir = path.join(process.cwd(), 'backups', 'mikrotik');
        if (!fs.existsSync(this.backupDir)) {
            fs.mkdirSync(this.backupDir, { recursive: true });
        }
    }

    private async extractJsonSnapshot(routerId: string, conn: any, comment?: string): Promise<any> {
        const snapshot: any = {
            metadata: {
                timestamp: new Date().toISOString(),
                routerId,
                comment,
                generator: "Maps Network Monitor JSON API Crawler",
                version: "1.0"
            },
            data: {}
        };
        
        const endpoints = [
            '/system/identity/print',
            '/system/resource/print',
            '/system/routerboard/print',
            '/system/user/print',
            '/ip/dns/print',
            '/ip/pool/print',
            '/ip/address/print',
            '/ip/dhcp-server/print',
            '/ip/dhcp-server/network/print',
            '/ip/firewall/nat/print',
            '/ip/firewall/filter/print',
            '/ip/firewall/mangle/print',
            '/interface/print',
            '/interface/bridge/print',
            '/interface/vlan/print',
            '/interface/pppoe-server/server/print',
            '/ppp/profile/print',
            '/ppp/secret/print',
            '/ip/hotspot/print',
            '/ip/hotspot/profile/print',
            '/ip/hotspot/user/profile/print',
            '/ip/hotspot/user/print',
            '/ip/hotspot/ip-binding/print',
            '/ip/hotspot/walled-garden/print'
        ];

        for (const cmd of endpoints) {
            try {
                logger.debug({ routerId, cmd }, `Crawling ${cmd}`);
                // Increased timeout to 60s to handle large datasets (10k+ users)
                const result = await safeWrite(conn, [cmd], 60000);
                const key = cmd.replace(/\/print$/, '').replace(/^\//, '');
                snapshot.data[key] = result;
            } catch (error: any) {
                logger.warn({ routerId, cmd, error: error.message }, `Failed to crawl ${cmd} (might not be supported on this RouterOS version)`);
            }
        }
        
        return snapshot;
    }

    /**
     * Trigger a binary backup (.backup), export (.rsc), or crawl a JSON Snapshot and save it.
     */
    async createBackup(routerId: string, type: 'backup' | 'rsc' | 'json', comment?: string, delay: number = 10): Promise<any> {
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

        let conn: any = null;
        try {
            // 1. Trigger backup generation on MikroTik via API
            conn = await connectToRouter({
                host: router.host,
                port: router.port,
                username: router.username,
                password: decrypt(router.passwordEncrypted)
            });
            logger.info({ routerId, type, remoteFilename }, 'Processing backup request...');

            if (type === 'json') {
                logger.info({ routerId }, 'Initiating JSON API Snapshot crawler...');
                const snapshotData = await this.extractJsonSnapshot(routerId, conn, comment);
                
                const localBasename = `bkp-${shortId}-${timestamp}.json`;
                const localPath = path.join(this.backupDir, localBasename);
                fs.writeFileSync(localPath, JSON.stringify(snapshotData, null, 2));
                
                const stats = fs.statSync(localPath);
                
                let finalTenantId = router.tenantId;
                if (!finalTenantId) {
                    if (router.groupId) {
                        const group = await db.query.routerGroups.findFirst({ where: eq(routerGroups.id, router.groupId) });
                        if (group?.tenantId) finalTenantId = group.tenantId;
                    }
                    if (!finalTenantId) {
                        const [firstTenant] = await db.select({ id: tenantsSchema.id }).from(tenantsSchema).limit(1);
                        if (firstTenant) finalTenantId = firstTenant.id;
                    }
                }

                if (!finalTenantId) {
                    throw ApiError.internal('Internal Configuration Error: Router has no tenant assignment');
                }

                const [backupRecord] = await db.insert(routerBackups).values({
                    routerId,
                    tenantId: finalTenantId,
                    filename: localBasename,
                    type: 'json',
                    size: stats.size,
                    comment,
                    createdAt: new Date()
                }).returning();

                return { message: 'JSON API Snapshot completed successfully.', filename: localBasename, record: backupRecord };
            }
            
            // For .rsc and .backup types below
            logger.info({ routerId, type, remoteFilename }, 'Generating backup on MikroTik...');
            // Attempt to determine OS version earlier so we can use it for both export format and fetch format
            let osVersion = router.routerOsVersion;
            if (!osVersion) {
                try {
                    const { getRouterInfo } = await import('../lib/mikrotik-api.js');
                    const info = await getRouterInfo(conn);
                    osVersion = info.version || null;
                } catch (e) {
                    logger.warn({ routerId, err: (e as Error).message }, 'Failed to fetch router version for export, defaulting to v7 syntax');
                }
            }
            const isVersion7 = osVersion && osVersion.startsWith('7');

            if (type === 'backup') {
                // Increased timeout for binary backup generation
                await safeWrite(conn, ['/system/backup/save', `=name=${remoteFilename}`], 120000);
            } else {
                const exportCmd = ['/export', `=file=${remoteFilename}`];
                
                if (isVersion7) {
                    exportCmd.push('=show-sensitive=yes');
                }
                
                logger.info({ routerId, osVersion, isVersion7, remoteFilename }, 'Running version-aware export command');
                await safeWrite(conn, exportCmd, 120000);
            }

            // Delay for file to be ready
            if (type === 'backup') {
                throw ApiError.badRequest('Fitur Biner (.backup) dinonaktifkan permanen pada arsitektur jaringan API-Only. Silakan gunakan format .rsc (Script) untuk kompatibilitas RouterOS v6 HTTPS Push.');
            }

            logger.info({ routerId, delay }, `Waiting ${delay} seconds for file to be ready...`);
            await new Promise(resolve => setTimeout(resolve, delay * 1000));

            logger.info({ routerId, remoteFilename }, 'Initiating HTTP Push upload (.rsc) from MikroTik...');

            const baseUrl = process.env.APP_URL || 'http://localhost:3001';
            const uploadUrlBase = `${baseUrl}/api/router-backups/upload/push/${encodeURIComponent(router.id)}/${encodeURIComponent(token)}/${encodeURIComponent(remoteFilename)}/${encodeURIComponent(type)}`;
            const isHttps = uploadUrlBase.startsWith('https://');
            
            const scriptName = `upload-${shortId}`;
            
            // Reverting to PUT-based workaround since POST fails outright on MT
            const robustScript = 
                `:local fn "${remoteFilename}"; :local r 0; ` +
                ":while ([:len [/file find name=$fn]] = 0 and $r < 15) do={ :delay 2s; :set r ($r + 1); }; " +
                ":if ([:len [/file find name=$fn]] > 0) do={ " +
                "  :local fs [/file get [find name=$fn] size]; " +
                "  :if ($fs > 0) do={ " +
                `    :local u ("${uploadUrlBase}/" . $fs); ` +
                `    /tool fetch url=$u http-method=put src-path=$fn keep-result=no check-certificate=no mode=${isHttps ? 'https' : 'http'} http-header-field="Content-Type:application/octet-stream"; ` +
                "  } else={ :log error \"Backup 0B\" }; " +
                "} else={ :log error \"Backup missing\" }";
            
            logger.info({ routerId, scriptName }, 'Creating temporary upload script on MikroTik...');
            
            try { await safeWrite(conn, ['/system/script/remove', `=numbers=${scriptName}`], 10000); } catch (e) {}

            await safeWrite(conn, [
                '/system/script/add',
                `=name=${scriptName}`,
                `=source=${robustScript}`
            ], 15000);

            logger.info({ routerId, scriptName }, 'Executing upload script (HTTP PUT fallback)...');
            await safeWrite(conn, ['/system/script/run', `=number=${scriptName}`], 120000);

            // Let the router work, cleanup shortly after
            await new Promise(resolve => setTimeout(resolve, 5000));
            
            try {
                await safeWrite(conn, ['/system/script/remove', `=numbers=${scriptName}`], 15000);
            } catch (cleanupErr: any) {
                logger.warn({ routerId, err: cleanupErr.message }, 'Failed to remove temporary upload script (non-fatal)');
            }

            logger.info({ routerId }, 'Backup upload command (PUT) sent successfully');
            return { message: 'Export Script triggered and HTTP PUT initiated. Menunggu file masuk...', filename: remoteFilename };
        } catch (error: any) {
            logger.error({ error: error.message, stack: error.stack, routerId }, 'MikroTik backup process failed');
            if (error instanceof ApiError) throw error;
            throw ApiError.internal(`MikroTik Backup Failed: ${error.message}`);


        } finally {
            // Release connection back to pool
            if (conn && (conn as any).release) (conn as any).release();
        }
    }

    /**
     * Handle incoming backup file upload from MikroTik
     */
    async handleBackupUpload(routerId: string, token: string, filename: string, type: 'backup' | 'rsc', fileBuffer: any, req?: any, expectedSize?: number) {
        try {
            // Debug logging for headers
            if (req && req.headers) {
                logger.debug({ headers: req.headers, routerId, filename, expectedSize }, 'Backup upload request headers');
            }

            const bufferSize = fileBuffer instanceof Buffer ? fileBuffer.length : (fileBuffer?.length || 0);
            logger.info({ routerId, filename, type, bufferSize, expectedSize }, 'Starting backup upload processing');
            
            const router = await db.query.routers.findFirst({
                where: eq(routers.id, routerId)
            });

            if (!router) {
                logger.error({ routerId }, 'Router not found for backup upload');
                throw ApiError.notFound('Router not found');
            }

            // Simple token verification
            const expectedToken = router.webhookSecret;
            if (!expectedToken || expectedToken !== token) {
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

            const isValidBuffer = fileBuffer instanceof Buffer && fileBuffer.length > 0;
            
            if (!isValidBuffer) {
                const receivedType = typeof fileBuffer === 'object' ? (fileBuffer?.constructor?.name || 'Object') : typeof fileBuffer;
                logger.error({ receivedType, bufferSize: fileBuffer?.length, expectedSize }, 'Received invalid or empty backup data');
                
                let errorMsg = `Received 0-byte file from MikroTik.`;
                if (expectedSize && expectedSize > 0) {
                    errorMsg += ` MikroTik OS Limitation Detected: RouterOS v6 cannot attach large files > 64KB to HTTP POST requests. Only RouterOS v7+ natively supports HTTP push backups. Please upgrade your router.`;
                } else {
                    errorMsg += ` Proxy/WAF likely stripped the body, or the file generation failed.`;
                }
                
                throw ApiError.badRequest(errorMsg);
            }

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
                throw ApiError.internal(`File system error: ${fsErr.message}`);
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

    /**
     * Reconstruct a .rsc script from an existing JSON backup record
     */
    async generateRscFromSnapshot(backupId: string): Promise<any> {
        const backup = await db.query.routerBackups.findFirst({
            where: eq(routerBackups.id, backupId)
        });

        if (!backup || backup.type !== 'json') {
            throw ApiError.notFound('JSON snapshot not found or invalid type');
        }

        const localPath = path.join(this.backupDir, backup.filename);
        if (!fs.existsSync(localPath)) {
            throw ApiError.notFound('Snapshot file missing on disk');
        }

        const snapshotData = JSON.parse(fs.readFileSync(localPath, 'utf8'));
        const rscContent = this.convertJsonToRsc(snapshotData);
        
        const rscFilename = backup.filename.replace('.json', '.reconstructed.rsc');
        const rscPath = path.join(this.backupDir, rscFilename);
        fs.writeFileSync(rscPath, rscContent);

        const stats = fs.statSync(rscPath);

        const [newRecord] = await db.insert(routerBackups).values({
            routerId: backup.routerId,
            tenantId: backup.tenantId,
            filename: rscFilename,
            type: 'rsc',
            size: stats.size,
            comment: `Reconstructed from Snapshot: ${backup.comment || backup.filename}`,
            createdAt: new Date()
        }).returning();

        return { message: 'RSC script reconstructed successfully', record: newRecord };
    }

    private convertJsonToRsc(snapshot: any): string {
        const lines: string[] = [
            "# ===========================================================",
            "# MIKROTIK CONFIGURATION RECONSTRUCTED FROM JSON SNAPSHOT",
            `# Generated on: ${new Date().toISOString()}`,
            `# Router ID: ${snapshot.metadata?.routerId || 'Unknown'}`,
            "# WARNING: USE WITH CAUTION. VERIFY COMMANDS BEFORE IMPORT.",
            "# ===========================================================\n"
        ];

        const menuOrder = [
            'system/identity',
            'ip/pool',
            'ip/dns',
            'ip/address',
            'ppp/profile',
            'ppp/secret',
            'interface/pppoe-server/server',
            'ip/hotspot/profile',
            'ip/hotspot/user/profile',
            'ip/hotspot/user',
            'ip/hotspot',
            'ip/hotspot/ip-binding',
            'ip/firewall/nat',
            'ip/firewall/filter'
        ];

        for (const menu of menuOrder) {
            const data = snapshot.data?.[menu];
            if (!data || !Array.isArray(data)) continue;

            lines.push(`\n# --- ${menu.toUpperCase()} ---`);
            
            for (const item of data) {
                const cmd = this.formatRscCommand(menu, item);
                if (cmd) lines.push(cmd);
            }
        }

        return lines.join('\n');
    }

    private formatRscCommand(menu: string, item: any): string | null {
        const basePath = `/${menu}`;
        const skipKeys = ['.id', '.nextid', '.id_local', 'bytes', 'packets', 'invalid', 'dynamic', 'running', 'disabled', 'comment'];
        
        // Special case for identity
        if (menu === 'system/identity') {
            return `/system identity set name="${item.name || 'MikroTik'}"`;
        }

        // Build add command
        const parts = [basePath, 'add'];
        
        // Add comment first if it exists
        if (item.comment) {
            parts.push(`comment="${item.comment}"`);
        }

        let hasData = false;

        for (const [key, value] of Object.entries(item)) {
            if (skipKeys.includes(key) || value === undefined || value === '') continue;
            
            // Format value: quote if contains spaces or special chars
            let formattedValue = String(value);
            if (formattedValue.includes(' ') || formattedValue.includes(';') || formattedValue === '') {
                formattedValue = `"${formattedValue}"`;
            }

            parts.push(`${key}=${formattedValue}`);
            hasData = true;
        }

        return hasData ? parts.join(' ') : null;
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

    /**
     * Push SMTP configuration and automated backup script/scheduler to MikroTik
     */
    async pushEmailConfig(routerId: string, config: {
        server: string,
        port: number,
        user: string,
        pass: string,
        recipient: string,
        interval: string
    }): Promise<any> {
        const router = await db.query.routers.findFirst({
            where: eq(routers.id, routerId)
        });

        if (!router) throw ApiError.notFound('Router not found');

        const conn = await connectToRouter({
            host: router.host,
            port: router.port,
            username: router.username,
            password: decrypt(router.passwordEncrypted)
        });

        try {
            // 1. Configure SMTP
            logger.info({ routerId, server: config.server }, 'Configuring MikroTik SMTP settings...');
            await safeWrite(conn, [
                '/tool/e-mail/set',
                `=address=${config.server}`,
                `=port=${config.port}`,
                `=user=${config.user}`,
                `=password=${config.pass}`,
                `=from=${config.user}`
            ]);

            // 2. Save SMTP configuration to database for persistence
            logger.info({ routerId }, 'Saving SMTP configuration to database...');
            await db.update(routers).set({
                emailSmtpServer: config.server,
                emailSmtpPort: config.port,
                emailSmtpUser: config.user,
                emailSmtpPassEncrypted: encrypt(config.pass),
                emailSmtpRecipient: config.recipient,
                emailSmtpInterval: config.interval,
                updatedAt: new Date()
            }).where(eq(routers.id, routerId));

            // 3. Clear old instances of the script/scheduler if they exist to avoid "already exists" errors
            try {
                const existingScripts = await safeWrite(conn, ['/system/script/print', '?name=auto-email-backup']);
                if (existingScripts.length > 0) {
                    await safeWrite(conn, ['/system/script/remove', `=numbers=${existingScripts[0]['.id']}`]);
                }
                const existingScheds = await safeWrite(conn, ['/system/scheduler/print', '?name=auto-email-backup-task']);
                if (existingScheds.length > 0) {
                    await safeWrite(conn, ['/system/scheduler/remove', `=numbers=${existingScheds[0]['.id']}`]);
                }
            } catch (e) {
                logger.debug('Cleanup of existing scripts failed (likely missing), proceeding...');
            }

            // 3. Inject the self-cleaning script
            const scriptName = "auto-email-backup";
            const scriptSource = [
                ":local ts [/system clock get date];",
                ":local host [/system identity get name];",
                ":local filename (\"bkp-\" . $host . \"-\" . [:pick $ts 7 11] . [:pick $ts 0 3] . [:pick $ts 4 6] . \".rsc\");",
                "/export file=$filename;",
                ":delay 10s;",
                `/tool e-mail send from="${config.user}" to="${config.recipient}" subject=($host . \" Backup - \" . $ts) file=$filename body=(\"Attached is the automatic configuration backup for \" . $host);`,
                ":delay 30s;",
                "/file remove $filename;",
                ":log info (\"Automated email backup sent and cleaned up for \" . $host);"
            ].join("");

            logger.info({ routerId }, 'Injecting MikroTik backup script...');
            await safeWrite(conn, [
                '/system/script/add',
                `=name=${scriptName}`,
                `=source=${scriptSource}`
            ]);

            // 4. Set up the scheduler
            logger.info({ routerId, interval: config.interval }, 'Configuring MikroTik backup scheduler...');
            await safeWrite(conn, [
                '/system/scheduler/add',
                '=name=auto-email-backup-task',
                `=interval=${config.interval}`,
                `=on-event=${scriptName}`,
                '=start-time=startup'
            ]);

            return { success: true, message: 'Automated email backup configured on MikroTik successfully' };
        } finally {
            conn.close();
        }
    }

    /**
     * Get saved SMTP configuration for a router
     */
    async getEmailConfig(routerId: string) {
        const router = await db.query.routers.findFirst({
            where: eq(routers.id, routerId),
            columns: {
                emailSmtpServer: true,
                emailSmtpPort: true,
                emailSmtpUser: true,
                emailSmtpPassEncrypted: true,
                emailSmtpRecipient: true,
                emailSmtpInterval: true
            }
        });

        if (!router) throw ApiError.notFound('Router not found');

        return {
            server: router.emailSmtpServer || '',
            port: router.emailSmtpPort || 587,
            user: router.emailSmtpUser || '',
            pass: router.emailSmtpPassEncrypted ? decrypt(router.emailSmtpPassEncrypted) : '',
            recipient: router.emailSmtpRecipient || '',
            interval: router.emailSmtpInterval || '24:00:00'
        };
    }
}

export const routerBackupService = new RouterBackupService();
