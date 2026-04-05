import { eq, and, or } from 'drizzle-orm';
import { db } from '../../db/index.js';
import {
    routers,
    routerNetwatch,
    onus,
} from '../../db/schema/index.js';
import { decrypt } from '../../lib/encryption.js';
import { alertService } from '../alert.service.js';
import { settingsService } from '../settings.service.js';
import { netwatchRepository } from '../../repositories/netwatch.repository.js';
import { alertRepository } from '../../repositories/alert.repository.js';

/**
 * Internal helper to find a router and decrypt its password.
 */
export async function findRouterWithPassword(id: string, tenantId?: string, tx: any = db): Promise<any> {
    const filters = [eq(routers.id, id)];
    if (tenantId) filters.push(eq(routers.tenantId, tenantId));
    const [router] = await tx.select().from(routers).where(and(...filters));
    if (!router) return null;
    return {
        ...router,
        password: router.passwordEncrypted ? decrypt(router.passwordEncrypted) : '',
    };
}

/**
 * Get all netwatch entries for a router with detailed info (ONUs/Alerts)
 */
export async function getNetwatch(routerId: string, tx: any = db): Promise<any[]> {
    const entries = await netwatchRepository.findWithDetails(routerId, tx);
    if (!entries || !Array.isArray(entries)) return [];
 
    const downAlertsResponse = await alertRepository.findAll({
        routerId,
        type: 'netwatch_down',
        limit: 500
    }, tx);
    const downAlerts = downAlertsResponse.data;

    return entries.map((entry: any) => {
        if (entry.status === 'down' && entry.host) {
            const matchingAlert = downAlerts.find((a: any) => a.message && a.message.includes(entry.host));
            if (matchingAlert) return { ...entry, lastDown: matchingAlert.createdAt };
        }
        return entry;
    });
}

/**
 * Batch query for all netwatch entries for multiple routers
 */
export async function getNetwatchAll(routerIds: string[]): Promise<any[]> {
    return netwatchRepository.findByRouterIdsWithDetails(routerIds);
}

/**
 * Create a new manual netwatch entry
 */
export async function create(routerId: string, data: any, tenantId?: string, tx: any = db): Promise<any> {
    // 0. Ensure tenantId is available (inherit from router if missing)
    let effectiveTenantId = tenantId;
    if (!effectiveTenantId) {
        const [router] = await tx
            .select({ tenantId: routers.tenantId })
            .from(routers)
            .where(eq(routers.id, routerId))
            .limit(1);
        if (router) {
            effectiveTenantId = router.tenantId || undefined;
        }
    }

    return netwatchRepository.create({
        routerId,
        tenantId: effectiveTenantId,
        host: data.host,
        name: data.name,
        deviceType: data.deviceType || 'client',
        interval: data.interval || 30,
        timeout: data.timeout || 1000,
        status: data.deviceType === 'odp' ? 'up' : 'unknown',
        isAppOnly: true,
        latitude: data.latitude,
        longitude: data.longitude,
        location: data.location,
        connectionType: data.connectionType || 'router',
        connectedToId: data.connectedToId,
        targetInterface: data.targetInterface,
        linkedOnuId: data.linkedOnuId,
        portCapacity: data.portCapacity,
        waypoints: data.waypoints,
    } as any, tx);
}

/**
 * Update an existing netwatch entry
 */
export async function updateEntry(routerId: string, id: string, data: any, tenantId?: string, tx: any = db): Promise<any> {
    // 1. Fetch current entry to check for IP changes
    const entry = await netwatchRepository.findById(id, tx);
    if (!entry || entry.routerId !== routerId) return null;

    const oldHost = entry.host;
    const newHost = data.host;
    const ipChanged = newHost && oldHost && newHost !== oldHost;

    // 2. If IP changed, perform system-wide alignment (Alerts/MikroTik/Webhooks)
    if (ipChanged) {
        // A. Resolve any existing alerts for the old host (system-wide alignment)
        try {
            await alertService.resolveAlertsByHost(routerId, oldHost, entry.tenantId || tenantId, tx);
        } catch (err: any) {
            console.error('[Netwatch Update] Failed to resolve old alerts:', err.message);
        }

        // B. Update on MikroTik (if not app-only)
        if (!entry.isAppOnly) {
            try {
                const router = await findRouterWithPassword(routerId, tenantId, tx);
                if (router) {
                    const { connectToRouter, updateNetwatchEntry, configureNetwatchWebhook } = await import('../../lib/mikrotik-api.js');
                    const conn = await connectToRouter(router);
                    
                    // Update host in /tool netwatch
                    await updateNetwatchEntry(conn, oldHost, { host: newHost });
                    
                    // Re-configure webhook to update hardcoded host in up/down scripts
                    if (router.useWebhook && router.webhookSecret && router.tenantId) {
                        const webhookUrl = await settingsService.getWebhookUrl(router.webhookSecret, router.tenantId);
                        await configureNetwatchWebhook(conn, newHost, webhookUrl, router.webhookSecret);
                    }

                    if (conn.release) conn.release();
                    else await conn.close();
                }
            } catch (err: any) {
                console.error('[Netwatch Update] Failed to update MikroTik/Webhook:', err.message);
            }
        }
    }

    // 3. If IP changed, cascade change to ONUs to preserve Map coordinates link
    if (ipChanged) {
        try {
            // Find ONUs linked to this host or SN
            await tx
                .update(onus)
                .set({ host: newHost, updatedAt: new Date() })
                .where(and(
                    eq(onus.routerId, routerId),
                    or(
                        eq(onus.host, oldHost),
                        eq(onus.id, entry.linkedOnuId || '')
                    )
                ));
        } catch (err: any) {
            console.error('[Netwatch Update] Failed to cascade IP change to ONUs:', err.message);
        }
    }

    // 4. Update the Netwatch record
    return netwatchRepository.update(id, {
        ...data,
        updatedAt: new Date(),
    }, tx);
}

/**
 * Delete a netwatch entry
 */
export async function deleteEntry(routerId: string, id: string, tenantId?: string, deleteFromMikrotik: boolean = true, tx: any = db): Promise<boolean> {
    const entry = await netwatchRepository.findById(id, tx);
    if (!entry || entry.routerId !== routerId) return false;

    if (deleteFromMikrotik && !entry.isAppOnly) {
        try {
            const router = await findRouterWithPassword(routerId, tenantId, tx);
            if (router) {
                const { connectToRouter, removeNetwatchEntry } = await import('../../lib/mikrotik-api.js');
                const conn = await connectToRouter(router);
                if (entry.host) {
                    await removeNetwatchEntry(conn, entry.host);
                }
                if (conn.release) conn.release();
                else await conn.close();
            }
        } catch (err) {
            // Silently log and continue - it might already be deleted on MikroTik
        }
    }

    return netwatchRepository.delete(id, tx);
}
