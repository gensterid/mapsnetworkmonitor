import { eq, inArray, sql, and } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { routers, routerNetwatch, onus, olts } from '../../db/schema/index.js';
import { logger } from '../../lib/logger.js';
import { alertService } from '../alert.service.js';

/**
 * Sync netwatch status to ONUs table
 */
export async function syncToOnus(routerId: string, tx: any = db): Promise<void> {
    try {
        const linkedOlts = await tx.select({ id: olts.id }).from(olts).where(eq(olts.parentId, routerId));
        if (linkedOlts.length === 0) {
            const [router] = await tx.select({ tenantId: routers.tenantId }).from(routers).where(eq(routers.id, routerId)).limit(1);
            if (!router?.tenantId) return;
            const activeOnus = await tx.select().from(onus).where(eq(onus.tenantId, router.tenantId));
            if (activeOnus.length === 0) return;
            return performLinkage(routerId, activeOnus, tx);
        }
 
        const oltIds = linkedOlts.map((o: any) => o.id);
        const activeOnus = await tx.select().from(onus).where(inArray(onus.oltId, oltIds));
        if (activeOnus.length === 0) return;
 
        return performLinkage(routerId, activeOnus, tx);
    } catch (err: any) { logger.error({ err: err?.message || String(err), routerId }, 'Failed to sync netwatch to onus'); }
}

/**
 * Multi-step confidence-based linkage logic
 */
export async function performLinkage(routerId: string, activeOnus: any[], tx: any = db): Promise<void> {
    try {
        const netwatchEntries = await tx.select().from(routerNetwatch).where(eq(routerNetwatch.routerId, routerId));
        if (netwatchEntries.length === 0) return;

        const hostToOnu = new Map(activeOnus.filter(o => o.host).map(o => [(o.host || '').trim(), o]));
        const nameToOnu = new Map(activeOnus.filter(o => !o.host).map(o => [(o.name || '').toLowerCase().trim(), o]));

        let linkedCount = 0;
        for (const entry of netwatchEntries) {
            const host = (entry.host || '').trim();
            const entryNameNormalized = (entry.name || '').toLowerCase().trim();
            if (!host || host === '0.0.0.0') continue;

            const targetOnu = hostToOnu.get(host) || nameToOnu.get(entryNameNormalized);
            if (targetOnu) {
                const status = entry.status === 'up' ? 'online' : (entry.status === 'down' ? 'offline' : targetOnu.status);
                const onuUpdateData: any = { status, lastSeen: status === 'online' ? new Date() : targetOnu.lastSeen, updatedAt: new Date() };

                if (host && targetOnu.host !== host) {
                    const oldHost = targetOnu.host;
                    onuUpdateData.host = host;
                    logger.info({ onu: targetOnu.name, sn: targetOnu.sn, oldHost, newHost: host }, '[Linkage] Updating host IP from Netwatch match');
                    
                    // System Alignment: Resolve all alerts for the OLD IP since it's no longer assigned here
                    if (oldHost && oldHost !== '0.0.0.0') {
                        alertService.resolveAlertsByHost(routerId, oldHost, targetOnu.tenantId, tx).catch(e => 
                            logger.warn({ err: e.message || String(e), host: oldHost }, 'Failed to resolve alerts for old host during linkage shift')
                        );
                    }

                    // Safety: Clear this IP from any OTHER ONU record to maintain 1-to-1 mapping
                    await tx.update(onus).set({ host: null }).where(and(eq(onus.host, host), sql`id != ${targetOnu.id}::uuid`));
                }
 
                const sources = (targetOnu.discoverySources as string[]) || [];
                if (!sources.includes('netwatch')) sources.push('netwatch');
                onuUpdateData.discoverySources = sources;
 
                await tx.update(onus).set(onuUpdateData).where(eq(onus.id, targetOnu.id));
 
                if (entry.linkedOnuId !== targetOnu.id) {
                    await tx.update(routerNetwatch).set({ linkedOnuId: targetOnu.id }).where(eq(routerNetwatch.id, entry.id));
                    logger.debug({ host, onuId: targetOnu.id }, '[Linkage] Persisted linkedOnuId');
                }
                linkedCount++;
            }
        }
        if (linkedCount > 0) logger.info({ routerId, linkedCount }, '[Unified Linkage] Sync complete');
    } catch (e) { logger.error({ err: e, routerId }, '[Unified Linkage] Failed to sync Netwatch to ONUs'); }
}

export async function ensureNetwatchEntry(routerId: string, host: string, name?: string, type?: 'olt' | 'router' | 'switch', tenantId?: string, tx: any = db) {
    const filters = [eq(routerNetwatch.routerId, routerId), eq(routerNetwatch.host, host)];
    if (name) filters.push(eq(routerNetwatch.name, name));
    const [existing] = await tx.select().from(routerNetwatch).where(and(...filters));

    if (existing) {
        const updatePayload: any = { isAppOnly: true, updatedAt: new Date() };
        if (type) {
            let deviceType: any = 'client';
            if (type === 'olt') deviceType = 'olt';
            else if (type === 'router') deviceType = 'router';
            else if (type === 'switch') deviceType = 'switch';
            updatePayload.deviceType = deviceType;
        }
        await tx.update(routerNetwatch).set(updatePayload).where(eq(routerNetwatch.id, existing.id));
        return existing.id;
    }
 
    const [byHost] = await tx.select().from(routerNetwatch).where(and(eq(routerNetwatch.routerId, routerId), eq(routerNetwatch.host, host)));
    if (byHost) {
        const updatePayload: any = { isAppOnly: true, updatedAt: new Date() };
        if (name && byHost.name !== name) updatePayload.name = name;
        await tx.update(routerNetwatch).set(updatePayload).where(eq(routerNetwatch.id, byHost.id));
        return byHost.id;
    }
 
    let deviceType: any = 'client';
    if (type === 'olt') deviceType = 'olt';
    else if (type === 'router') deviceType = 'router';
    else if (type === 'switch') deviceType = 'switch';
 
    const [inserted] = await tx.insert(routerNetwatch).values({ routerId, host, name, deviceType, isAppOnly: true, tenantId, status: 'unknown', interval: 60 } as any).returning();
    return inserted.id;
}
