import { eq, and } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { routers, routerNetwatch } from '../../db/schema/index.js';
import { alertService } from '../alert.service.js';
import { logger } from '../../lib/logger.js';
import { eventEmitter } from '../event-emitter.service.js';

const webhookQueue = new Map<string, { status: string; timer: NodeJS.Timeout }>();

export async function handleWebhook(routerId: string, host: string, status: string) {
    const queueKey = `${routerId}:${host}`;
    const existing = webhookQueue.get(queueKey);
    if (existing) clearTimeout(existing.timer);

    const timer = setTimeout(() => {
        processQueue(routerId, host, status);
        webhookQueue.delete(queueKey);
    }, 2000);

    webhookQueue.set(queueKey, { status, timer });
}

async function processQueue(routerId: string, host: string, status: string) {
    try {
        const [router] = await db.select().from(routers).where(eq(routers.id, routerId));
        if (!router) return;

        const [entry] = await db.select().from(routerNetwatch).where(and(eq(routerNetwatch.routerId, routerId), eq(routerNetwatch.host, host)));
        if (!entry) return;

        const newStatus = status.toLowerCase() === 'up' ? 'up' : 'down';
        if (entry.status === newStatus) return;

        const finalName = entry.name || host;
        await alertService.createNetwatchAlert(routerId, `[${router.name}] ${finalName}`, host, newStatus);
        
        const updateData: any = { status: newStatus, lastCheck: new Date(), updatedAt: new Date() };
        if (newStatus === 'up') updateData.lastUp = new Date(); else updateData.lastDown = new Date();
        
        await db.update(routerNetwatch).set(updateData).where(eq(routerNetwatch.id, entry.id));
        eventEmitter.broadcast('netwatch_status_change', { routerId, host, status: newStatus });
        logger.info({ routerId, host, status: newStatus }, 'Webhook status updated');
    } catch (err: any) { logger.error({ err: err?.message || String(err), routerId, host }, 'Webhook process error'); }
}

export function getInterfaceName(comment?: string): string | null {
    if (!comment) return null;
    const match = comment.match(/interface=([^,\s\]]+)/i);
    return match ? match[1] : null;
}
