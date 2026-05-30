import { eq, inArray } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { routerNetwatch, topologyNodes, type NewRouterNetwatch } from '../../db/schema/index.js';
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
import crypto from 'crypto';

// Phase 26 — short hash used as webhook idempotency signature. We don't need
// the full sha256, 16 hex chars is plenty for uniqueness given the small
// input space (host + url + secret).
function sha256Short(input: string): string {
    return crypto.createHash('sha256').update(input).digest('hex').substring(0, 16);
}

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
                let webhookSyncedAt = existing?.webhookLastSyncedAt as Date | null | undefined;

                // Phase 26 — webhook idempotency cache.
                // Compute a stable signature from (host, webhookUrl, webhookSecret).
                // If the cached signature matches AND we synced this entry within
                // the freshness window, skip touching MikroTik entirely. Avoids
                // the per-cycle re-injection that previously flooded the router
                // log with 'netwatch host modified' events.
                const expectedSig = router.webhookSecret
                    ? sha256Short(`${nw.host}|${webhookUrl}|${router.webhookSecret}`)
                    : null;
                const WEBHOOK_FRESHNESS_MS = 24 * 60 * 60 * 1000; // 24h
                const sigMatches = !!expectedSig && existing?.webhookSignature === expectedSig;
                const recentSync = !!webhookSyncedAt && (Date.now() - new Date(webhookSyncedAt).getTime()) < WEBHOOK_FRESHNESS_MS;

                // Phase 26 v3 — balance between idempotency and correctness.
                //
                // Trust cache when ALL three agree:
                //   1. signature matches (inputs unchanged)
                //   2. timestamp is fresh (synced within 24h)
                //   3. database flag has_webhook=true (we successfully injected before)
                //
                // Why include hasWebhook (DB flag, NOT script content):
                // - has_webhook is what WE wrote when sync succeeded last time
                // - If has_webhook=false in DB, we've never confirmed a successful
                //   inject for this entry — must run the inject flow
                // - This catches the use_webhook off→on toggle case where prior
                //   cycle cleared has_webhook but signature wasn't reset
                //
                // We still do NOT include nw.upScript / nw.downScript check
                // because RouterOS API truncates long scripts on read.
                const skipWebhookWork = sigMatches && recentSync && existing?.hasWebhook === true;

                // Phase 26 v4 — preserve has_webhook on skip path.
                // Without this, the upsert at the end overwrites has_webhook with
                // `finalHasWebhook` (computed at line 98 from nw.upScript checks).
                // For some entries MikroTik API returns up-script content where
                // the webhook tail isn't detected, so detectedWebhook=false →
                // finalHasWebhook=false → upsert corrupts DB to has_webhook=false
                // → next cycle's skip check fails → re-inject → flip-flop loop.
                //
                // When skip applies, we already trust the cache. Preserve the
                // known-good has_webhook flag we set when inject originally
                // succeeded, regardless of what the truncated script read says.
                if (skipWebhookWork) {
                    finalHasWebhook = true;
                }

                // Phase 26 diagnostic — set NETWATCH_WEBHOOK_DEBUG=true to log
                // per-entry decision so we can identify why cache doesn't skip.
                if (process.env.NETWATCH_WEBHOOK_DEBUG === 'true' && shouldInjectWebhook) {
                    logger.info({
                        host: nw.host,
                        expectedSig,
                        storedSig: existing?.webhookSignature || null,
                        sigMatches,
                        webhookSyncedAt: webhookSyncedAt ? new Date(webhookSyncedAt).toISOString() : null,
                        recentSync,
                        hasUpWebhook,
                        hasDownWebhook,
                        detectedWebhook,
                        isOurUpWebhook,
                        isOurDownWebhook,
                        finalHasWebhook,
                        skipWebhookWork,
                    }, '[Webhook Cache Decision]');
                }

                if (shouldInjectWebhook && (existing?.deviceType || 'client') !== 'odp' && nw.host && !skipWebhookWork) {
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
                    // Record the successful (or already-correct) sync so the next
                    // cycle can skip via the signature cache.
                    webhookSyncedAt = new Date();
                } else if (!shouldInjectWebhook && isOurWebhook) {
                    try {
                        await removeNetwatchWebhook(conn, nw.host, router.webhookSecret || '', nw);
                        finalHasWebhook = false;
                    } catch (err) { logger.warn({ err: String(err), host: nw.host }, 'Failed cleanup webhook'); }
                    webhookSyncedAt = null;
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
                    webhookSignature: expectedSig,
                    webhookLastSyncedAt: webhookSyncedAt ?? null,
                    tenantId: router.tenantId,
                    updatedAt: new Date()
                };

                if (nw.comment && availableInterfaces?.has(nw.comment)) baseData.targetInterface = nw.comment;
                upsertData.push(baseData);
            }

            if (upsertData.length > 0) {
                // Deduplicate by (routerId, host) before passing to upsertBatch.
                // RouterOS can legitimately have two /tool netwatch entries with
                // the same host (e.g. one named, one default) — and the upsert
                // statement uses (router_id, host) as the ON CONFLICT target, so
                // a duplicate in the same batch triggers
                //   'ON CONFLICT DO UPDATE command cannot affect row a second time'
                // which rolls the entire sync back. Keep the LAST occurrence so
                // the most recent name/status wins; that matches what the next
                // sync round would do if it had run on the deduped set.
                const deduped = new Map<string, any>();
                for (const row of upsertData) {
                    if (!row?.host) continue;
                    deduped.set(`${row.routerId}:${row.host}`, row);
                }
                const finalBatch = Array.from(deduped.values());
                if (finalBatch.length !== upsertData.length) {
                    logger.warn({
                        routerId,
                        original: upsertData.length,
                        deduped: finalBatch.length,
                        skipped: upsertData.length - finalBatch.length,
                    }, 'Netwatch sync: deduplicated duplicate (router_id, host) entries before upsert');
                }
                if (finalBatch.length > 0) {
                    await netwatchRepository.upsertBatch(finalBatch, transaction);
                }
            }

            // Smart Sync: after upsert, detect rows with duplicate names within
            // this router (typically caused by IP migrations where MikroTik kept
            // the old entry). Flag them so the UI can prompt operator to resolve.
            try {
                const conflictsFlagged = await netwatchRepository.markDuplicateNameConflicts(routerId, transaction);
                if (conflictsFlagged > 0) {
                    logger.info({ routerId, conflictsFlagged }, '[NetwatchSync] Flagged duplicate-name conflicts');
                }
            } catch (e: any) {
                logger.warn({ err: e?.message || String(e), routerId }, '[NetwatchSync] Failed to flag duplicate-name conflicts');
            }

            const toDelete = existingEntries.filter((e: any) => {
                // 1. Basic filter per existing logic: must be a client, not app-only, has a host, and not found in current scan
                if (e.deviceType !== 'client' || e.isAppOnly || !e.host || e.host === '0.0.0.0' || processedHosts.has(e.host)) {
                    return false;
                }

                // 2. SAFETY CHECK: Do not delete if the device has MANUAL MAPPING
                // If connectedToId is NOT the routerId, it's mapped to an ODP or other device.
                const isManuallyConnected = e.connectedToId && e.connectedToId !== routerId;
                const hasWaypoints = e.waypoints && e.waypoints !== '[]' && e.waypoints !== '';
                const isCustomType = e.connectionType && e.connectionType !== 'router';

                if (isManuallyConnected || hasWaypoints || isCustomType) {
                    logger.debug({ routerId, host: e.host, name: e.name }, '🛡️ Netwatch Cleanup: Skipping deletion of mapped device to protect network topology.');
                    return false;
                }

                return true;
            });

            if (toDelete.length > 0) {
                const ids = toDelete.map((e: any) => e.id);
                await transaction.delete(routerNetwatch).where(inArray(routerNetwatch.id, ids));

                // Null-ify topology node references to avoid orphaned schematic nodes.
                await transaction.update(topologyNodes).set({ nodeId: null }).where(inArray(topologyNodes.nodeId, ids));

                // Resolve stale alerts immediately rather than waiting for next sweep.
                for (const entry of toDelete) {
                    logger.info({ routerId, host: entry.host, name: entry.name, reason: 'not_in_mikrotik' }, '[NetwatchSync] Auto-deleted stale entry');
                    if (entry.host) {
                        await alertService.resolveAlertsByHost(routerId, entry.host, router.tenantId ?? undefined, transaction).catch((e: any) =>
                            logger.warn({ err: e?.message || String(e), host: entry.host }, '[NetwatchSync] Failed to resolve alerts for deleted entry')
                        );
                    }
                }

                logger.info({ routerId, deletedCount: toDelete.length }, 'Cleaned up stale netwatch hosts (unmapped only)');
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
