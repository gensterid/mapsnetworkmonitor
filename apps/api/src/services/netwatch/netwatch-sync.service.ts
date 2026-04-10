import { eq, inArray } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { routerNetwatch, type NewRouterNetwatch } from '../../db/schema/index.js';
import {
    getNetwatchHosts,
    getRouterClock,
    configureNetwatchWebhook,
    removeNetwatchWebhook,
    connectToRouter,
} from '../../lib/mikrotik-api.js';
import { decrypt } from '../../lib/encryption.js';
import { alertService } from '../alert.service.js';
import { settingsService } from '../settings.service.js';
import { logger } from '../../lib/logger.js';
import { routerRepository } from '../../repositories/router.repository.js';
import { netwatchRepository } from '../../repositories/netwatch.repository.js';
import os from 'os';

/**
 * Sync and update hosts status from MikroTik (inside an existing connection)
 */
export async function syncHosts(routerId: string, routerName: string, conn: any, availableInterfaces?: Set<string>, tx: any = db): Promise<void> {
    try {
        const router = await routerRepository.findById(routerId, tx);
        if (!router) return;

        const shouldInjectWebhook = router.useWebhook && !!router.webhookSecret && !!router.tenantId;
        const webhookUrl = shouldInjectWebhook ? await settingsService.getWebhookUrl(router.webhookSecret!, router.tenantId!) : '';
        const hostname = os.hostname();
        
        const baseUrl = await settingsService.getSettingValue<string>('webhook_base_url', router.tenantId!, 'http://localhost:5173');
        const cleanBaseUrl = (baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl).toLowerCase();
        
        logger.info({ routerId, name: routerName, shouldInjectWebhook, server: hostname }, 'Netwatch sync starting');

        const routerClock = await getRouterClock(conn).catch(() => undefined);
        const mikrotikNetwatch = await getNetwatchHosts(conn, routerClock);
        const existingEntries = await netwatchRepository.findWithDetails(routerId, tx);
        // Map 1: Primary lookup by Host (IP/Address)
        const hostMap = new Map<string, any>(existingEntries.map((e: any) => [e.host, e]));
        // Map 2: Secondary lookup by Name (Comment) to catch identity shifts
        const commentMap = new Map<string, any>(
            existingEntries
                .filter((e: any) => e.name && e.name.trim() !== '')
                .map((e: any) => [e.name.toLowerCase().trim(), e])
        );

        const processedHosts = new Set<string>();
        const upsertData: NewRouterNetwatch[] = [];

        const executeSync = async (transaction: any) => {
            for (const nw of mikrotikNetwatch) {
                if (!nw.host) continue;
                
                let existing = hostMap.get(nw.host);
                const nwComment = (nw.comment || nw.name || '').toLowerCase().trim();

                // SMART MATCHING: If Host doesn't match, try to match by Comment/Name
                // This prevents duplication when a host is changed from DNS names to IPs (common during restores)
                if (!existing && nwComment !== '') {
                    const fallbackMatch = commentMap.get(nwComment);
                    if (fallbackMatch && fallbackMatch.host !== nw.host) {
                        logger.info({ routerId, oldHost: fallbackMatch.host, newHost: nw.host, comment: nwComment }, '🔄 Netwatch: Identity Migration detected. Syncing old name record to new IP address.');
                        
                        // Update the existing record's host string immediately so the subsequent UPSERT 
                        // hits the unique (router_id, host) index correctly instead of creating a duplicate.
                        await transaction.update(routerNetwatch).set({ host: nw.host }).where(eq(routerNetwatch.id, fallbackMatch.id));
                        
                        existing = fallbackMatch;
                        // Important: mark the old host as processed so it doesn't get cleaned up as "stale"
                        processedHosts.add(fallbackMatch.host!);
                    }
                }

                processedHosts.add(nw.host);
                const status: 'up' | 'down' | 'unknown' = (nw.status === 'up') ? 'up' : (nw.status === 'down' ? 'down' : 'unknown');
                const isDisabled = nw.disabled === true;

                let finalName = nw.comment || nw.name;
                if (!finalName && existing) finalName = existing.name?.replace(/^\[DISABLED\]\s*/, '') || '';

                if (!isDisabled && existing && existing.status !== status && existing.status !== 'unknown' && status !== 'unknown') {
                    if (status === 'down' || status === 'up') {
                        // Independent call to ensure alert commits even if parent transaction rolls back
                        await alertService.createNetwatchAlert(routerId, `[${routerName}] ${finalName}`, nw.host, status);
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
                            const [owner] = await transaction.select({ id: routerNetwatch.id }).from(routerNetwatch).where(eq(routerNetwatch.id, currentToken));
                            if (!owner) forceReconfig = true;
                        }
                        if (!isOurWebhook && detectedWebhook) forceReconfig = true;
                    }

                    if (!finalHasWebhook || isPartiallyMissing || forceReconfig) {
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

                const baseData: any = { 
                    routerId, 
                    host: nw.host, 
                    name: finalName, 
                    interval: nw.interval || 30, 
                    status, 
                    disabled: isDisabled, 
                    lastCheck: new Date(), 
                    lastUp: nw.sinceUp, 
                    lastDown: nw.sinceDown, 
                    hasWebhook: finalHasWebhook, 
                    tenantId: router.tenantId,
                    updatedAt: new Date()
                };

                if (nw.comment && availableInterfaces?.has(nw.comment)) baseData.targetInterface = nw.comment;
                upsertData.push(baseData);
            }

            if (upsertData.length > 0) {
                await netwatchRepository.upsertBatch(upsertData, transaction);
            }

            const toDelete = existingEntries.filter((e: any) => e.deviceType === 'client' && !e.isAppOnly && e.host && e.host !== '0.0.0.0' && !processedHosts.has(e.host));
            if (toDelete.length > 0) {
                await transaction.delete(routerNetwatch).where(inArray(routerNetwatch.id, toDelete.map((e: any) => e.id)));
                logger.info({ routerId, deletedCount: toDelete.length }, 'Cleaned up stale netwatch hosts');
            }
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
export async function fullSync(routerId: string): Promise<{ synced: number; errors: string[] }> {
    const errors: string[] = [];
    const router = await routerRepository.findById(routerId);
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
