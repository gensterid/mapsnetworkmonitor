import { db } from '../db/index.js';
import { presets, NewPreset } from '../db/schema/presets.js';
import { eq, and, desc } from 'drizzle-orm';

/**
 * Semua operasi di-scope tenant. Pola: `tenantId ? eq(...) : undefined` di
 * dalam `and()` — untuk superadmin (tenantId null/undefined) filter di-drop
 * sehingga lintas-tenant (memang boleh). Route WAJIB memasang
 * `requireTenantContext` agar akun orphan tidak ikut lolos tanpa scope.
 */
export const presetService = {
    /**
     * Create a new preset (tenantId dipaksa dari pemanggil, bukan dari body).
     */
    create: async (data: NewPreset) => {
        const [newPreset] = await db.insert(presets).values(data).returning();
        return newPreset;
    },

    /**
     * Get all presets untuk tenant tertentu (superadmin: semua).
     */
    findAll: async (tenantId?: string | null) => {
        return db
            .select()
            .from(presets)
            .where(tenantId ? eq(presets.tenantId, tenantId) : undefined)
            .orderBy(desc(presets.createdAt));
    },

    /**
     * Get preset by ID, di-scope tenant.
     */
    findById: async (id: string, tenantId?: string | null) => {
        const [preset] = await db
            .select()
            .from(presets)
            .where(and(eq(presets.id, id), tenantId ? eq(presets.tenantId, tenantId) : undefined));
        return preset;
    },

    /**
     * Update a preset, di-scope tenant (tak bisa menyentuh preset tenant lain).
     */
    update: async (id: string, data: Partial<NewPreset>, tenantId?: string | null) => {
        const [updatedPreset] = await db
            .update(presets)
            .set({ ...data, updatedAt: new Date() })
            .where(and(eq(presets.id, id), tenantId ? eq(presets.tenantId, tenantId) : undefined))
            .returning();
        return updatedPreset;
    },

    /**
     * Delete a preset, di-scope tenant.
     */
    delete: async (id: string, tenantId?: string | null) => {
        const [deletedPreset] = await db
            .delete(presets)
            .where(and(eq(presets.id, id), tenantId ? eq(presets.tenantId, tenantId) : undefined))
            .returning();
        return deletedPreset;
    },
};
