import { eq, and, desc } from 'drizzle-orm';
import { db } from '../db/index.js';
import { fiberCables, routers } from '../db/schema/index.js';
import { ApiError } from '../middleware/error.middleware.js';

export interface CableDistanceMarker {
    side: string;
    meters: number;
    label?: string;
}

export interface CableInput {
    name?: string | null;
    routerId?: string | null;
    path?: [number, number][];
    cores?: number[];
    distanceMarkers?: CableDistanceMarker[];
    fromDeviceId?: string | null;
    toDeviceId?: string | null;
    notes?: string | null;
}

const EDITABLE_FIELDS = [
    'name', 'routerId', 'path', 'cores', 'distanceMarkers', 'fromDeviceId', 'toDeviceId', 'notes',
] as const;

export class CableService {
    /**
     * Kalau routerId diisi, pastikan router itu milik tenant ini (cegah
     * assign kabel ke router tenant lain). Lempar 404 (jangan bocorkan).
     */
    private async assertRouterTenant(routerId: string | null | undefined, tenantId?: string) {
        if (!tenantId || !routerId) return;
        const [r] = await db.select({ id: routers.id }).from(routers)
            .where(and(eq(routers.id, routerId), eq(routers.tenantId, tenantId)));
        if (!r) throw new ApiError(404, 'Router not found');
    }

    async list(tenantId?: string, routerId?: string) {
        const conds = [];
        if (tenantId) conds.push(eq(fiberCables.tenantId, tenantId));
        if (routerId) conds.push(eq(fiberCables.routerId, routerId));
        return db.select().from(fiberCables)
            .where(conds.length ? and(...conds) : undefined)
            .orderBy(desc(fiberCables.updatedAt));
    }

    async getById(id: string, tenantId?: string) {
        const [c] = await db.select().from(fiberCables).where(eq(fiberCables.id, id));
        if (!c) return null;
        // Tenant scoping — jangan bocorkan/ubah kabel milik tenant lain. Tanpa
        // truthy-check pada c.tenantId: kabel NULL-tenant (mis. dibuat superadmin
        // tanpa X-Tenant-Id) TIDAK boleh diakses caller ber-tenant. (sama pola
        // topology.service; jangan tambah `&& c.tenantId` yang justru buka lubang.)
        if (tenantId && c.tenantId !== tenantId) return null;
        return c;
    }

    async create(data: CableInput, tenantId?: string) {
        await this.assertRouterTenant(data.routerId, tenantId);
        const [inserted] = await db.insert(fiberCables).values({
            tenantId: tenantId || null,
            routerId: data.routerId || null,
            name: data.name || null,
            path: data.path || [],
            cores: data.cores || [],
            distanceMarkers: data.distanceMarkers || [],
            fromDeviceId: data.fromDeviceId || null,
            toDeviceId: data.toDeviceId || null,
            notes: data.notes || null,
        }).returning();
        return inserted;
    }

    async update(id: string, data: CableInput, tenantId?: string) {
        const existing = await this.getById(id, tenantId);
        if (!existing) throw new ApiError(404, 'Cable not found');
        if (data.routerId !== undefined) await this.assertRouterTenant(data.routerId, tenantId);
        const patch: Record<string, unknown> = { updatedAt: new Date() };
        for (const k of EDITABLE_FIELDS) {
            if (data[k] !== undefined) patch[k] = data[k];
        }
        const [updated] = await db.update(fiberCables).set(patch)
            .where(eq(fiberCables.id, id)).returning();
        return updated;
    }

    async delete(id: string, tenantId?: string) {
        const existing = await this.getById(id, tenantId);
        if (!existing) throw new ApiError(404, 'Cable not found');
        await db.delete(fiberCables).where(eq(fiberCables.id, id));
        return true;
    }
}

export const cableService = new CableService();
