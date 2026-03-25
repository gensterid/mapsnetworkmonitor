import { eq, inArray } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { routers, routerNetwatch } from '../../db/schema/index.js';
import {
    getNetwatchHosts,
    getRouterClock,
    configureNetwatchWebhook,
    removeNetwatchWebhook,
} from '../../lib/mikrotik-api.js';
import { decrypt } from '../../lib/encryption.js';
import { alertService } from '../alert.service.js';
import { settingsService } from '../settings.service.js';
import { logger } from '../../lib/logger.js';
import os from 'os';

/**
 * Sync and update hosts status from MikroTik (inside an existing connection)
 */
export async function syncHosts(routerId: string, routerName: string, conn: any, availableInterfaces?: Set<string>, tx: any = db): Promise<void> {
    try {
        const [router] = await tx.select().from(routers).where(eq(routers.id, routerId));
        if (!router) return;

        const shouldInjectWebhook = router.useWebhook && !!router.webhookSecret && !!router.tenantId;
        const webhookUrl = shouldInjectWebhook ? await settingsService.getWebhookUrl(router.webhookSecret!, router.tenantId!) : '';
        const hostname = os.hostname();
        
        const baseUrl = await settingsService.getSettingValue<string>('webhook_base_url', router.tenantId!, 'http://localhost:5173');
        const cleanBaseUrl = (baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl).toLowerCase();
        
        logger.info({ routerId, name: routerName, shouldInjectWebhook, server: hostname }, 'Netwatch sync starting');

        const routerClock = await getRouterClock(conn).catch(() => undefined);
        const mikrotikNetwatch = await getNetwatchHosts(conn, routerClock);
        const existingEntries = await tx.select().from(routerNetwatch).where(eq(routerNetwatch.routerId, routerId));
        const existingMap = new Map<string, any>(existingEntries.map((e: any) => [e.host, e]));
        const processedHosts = new Set<string>();

        const executeSync = async (transaction: any) => {
            for (const nw of mikrotikNetwatch) {
                if (!nw.host) continue;
                processedHosts.add(nw.host);

                const existing = existingMap.get(nw.host);
                const status: 'up' | 'down' | 'unknown' = (nw.status === 'up') ? 'up' : (nw.status === 'down' ? 'down' : 'unknown');
                const isDisabled = nw.disabled === true;

                let finalName = nw.comment || nw.name;
                if (!finalName && existing) finalName = existing.name?.replace(/^\[DISABLED\]\s*/, '') || '';

                if (!isDisabled && existing && existing.status !== status && existing.status !== 'unknown' && status !== 'unknown') {
                    if (status === 'down' || status === 'up') {
                        await alertService.createNetwatchAlert(routerId, `[${routerName}] ${finalName}`, nw.host, status, transaction);
                    }
                }

                const hasUpWebhook = nw.upScript?.toLowerCase().includes('/api/webhook/netwatch');
                const hasDownWebhook = nw.downScript?.toLowerCase().includes('/api/webhook/netwatch');
                const detectedWebhook = (hasUpWebhook && hasDownWebhook) || false;
                const isPartiallyMissing = (hasUpWebhook || hasDownWebhook) && !detectedWebhook;

                const isOurUpWebhook = nw.upScript?.toLowerCase().includes(cleanBaseUrl) && (router.webhookSecret && nw.upScript?.includes(`Bearer ${router.webhookSecret}`));
                const isOurDownWebhook = nw.downScript?.toLowerCase().includes(cleanBaseUrl) && (router.webhookSecret && nw.downScript?.includes(`Bearer ${router.webhookSecret}`));
                const isOurWebhook = isOurUpWebhook || isOurDownWebhook;

                let finalHasWebhook = detectedWebhook && isOurWebhook;

                if (shouldInjectWebhook && (existing?.deviceType || 'client') !== 'odp' && nw.host) {
                    let forceReconfig = false;
                    if (finalHasWebhook) {
                        const combo = (nw.upScript || '') + (nw.downScript || '');
                        const tokenMatch = combo.match(/Bearer ([a-f0-9]+)/i);
                        const currentToken = tokenMatch ? tokenMatch[1] : null;

                        if (currentToken && currentToken !== router.webhookSecret) {
                            const [owner] = await transaction.select({ id: routers.id, useWebhook: routers.useWebhook }).from(routers).where(eq(routers.webhookSecret, currentToken));
                            if (!owner || !owner.useWebhook) forceReconfig = true;
                        }
                        if (!isOurWebhook && detectedWebhook) forceReconfig = true;
                    }

                    if (!finalHasWebhook || isPartiallyMissing || forceReconfig) {
                        if (detectedWebhook && !isOurWebhook) {
                            const upMatch = nw.upScript?.match(/Bearer ([a-zA-Z0-9_-]+)/);
                             const downMatch = nw.downScript?.match(/Bearer ([a-zA-Z0-9_-]+)/);
                             const existingToken = upMatch?.[1] || downMatch?.[1];
 
                             if (existingToken) {
                                 const [owner] = await transaction.select({ id: routers.id, useWebhook: routers.useWebhook }).from(routers).where(eq(routers.webhookSecret, existingToken));
                                 if (!owner || !owner.useWebhook) forceReconfig = true;
                             } else forceReconfig = true;
                        }

                        try {
                            await configureNetwatchWebhook(conn, nw.host, webhookUrl, router.webhookSecret!, nw, forceReconfig);
                            if (!detectedWebhook || isOurWebhook || forceReconfig) finalHasWebhook = true;
                        } catch (err) { logger.warn({ err: String(err), host: nw.host }, 'Failed to configure webhook'); }
                    }
                } else if (!shouldInjectWebhook && isOurWebhook) {
                    try {
                        await removeNetwatchWebhook(conn, nw.host, router.webhookSecret || '', nw);
                        finalHasWebhook = false;
                    } catch (err) { logger.warn({ err: String(err), host: nw.host }, 'Failed cleanup webhook'); }
                }

                 if (existing) {
                     const updateData: any = { name: finalName, interval: nw.interval || existing.interval, status, disabled: isDisabled, lastCheck: new Date(), lastUp: nw.sinceUp || existing.lastUp, lastDown: nw.sinceDown || existing.lastDown, updatedAt: new Date(), hasWebhook: finalHasWebhook };
                     if (!existing.targetInterface && nw.comment && availableInterfaces?.has(nw.comment)) updateData.targetInterface = nw.comment;
                     await transaction.update(routerNetwatch).set(updateData).where(eq(routerNetwatch.id, existing.id));
                 } else {
                     const insertData: any = { routerId, host: nw.host, name: finalName, interval: nw.interval || 30, status, disabled: isDisabled, lastCheck: new Date(), lastUp: nw.sinceUp, lastDown: nw.sinceDown, hasWebhook: finalHasWebhook, tenantId: router.tenantId };
                     if (nw.comment && availableInterfaces?.has(nw.comment)) insertData.targetInterface = nw.comment;
                     await transaction.insert(routerNetwatch).values(insertData);
                 }
             }
 
             const toDelete = existingEntries.filter((e: any) => e.deviceType === 'client' && !e.isAppOnly && e.host && e.host !== '0.0.0.0' && !processedHosts.has(e.host));
             if (toDelete.length > 0) await transaction.delete(routerNetwatch).where(inArray(routerNetwatch.id, toDelete.map((e: any) => e.id)));
             await transaction.update(routerNetwatch).set({ lastCheck: new Date() }).where(eq(routerNetwatch.routerId, routerId));
         };

        if (tx !== db) {
            await executeSync(tx);
        } else {
            await db.transaction(async (innerTx) => {
                await executeSync(innerTx);
            });
        }
    } catch (err: any) { logger.error({ err: err?.message || String(err), router: routerName }, 'Failed to sync netwatch'); }
}

/**
 * Perform a full sync from MikroTik (handles its own connection)
 */
import { connectToRouter } from '../../lib/mikrotik-api.js';

export async function fullSync(routerId: string): Promise<{ synced: number; errors: string[] }> {
    const errors: string[] = [];
    const [router] = await db.select().from(routers).where(eq(routers.id, routerId));
    if (!router) throw new Error('Router not found');

    let api: any;
    try {
        const password = decrypt(router.passwordEncrypted!);
        api = await connectToRouter({ host: router.host, port: router.port, username: router.username, password });
        await syncHosts(routerId, router.name, api);
        return { synced: 1, errors: [] };
    } catch (err: any) {
        errors.push(err.message || String(err));
        return { synced: 0, errors };
    } finally { if (api) api.close(); }
}
