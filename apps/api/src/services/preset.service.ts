import { db } from '../db';
import { presets, NewPreset, Preset } from '../db/schema/presets';
import { eq, desc } from 'drizzle-orm';

export const presetService = {
    /**
     * Create a new preset
     */
    create: async (data: NewPreset) => {
        const [newPreset] = await db.insert(presets).values(data).returning();
        return newPreset;
    },

    /**
     * Get all presets
     */
    findAll: async () => {
        return db.select().from(presets).orderBy(desc(presets.createdAt));
    },

    /**
     * Get preset by ID
     */
    findById: async (id: string) => {
        const [preset] = await db.select().from(presets).where(eq(presets.id, id));
        return preset;
    },

    /**
     * Update a preset
     */
    update: async (id: string, data: Partial<NewPreset>) => {
        const [updatedPreset] = await db
            .update(presets)
            .set({ ...data, updatedAt: new Date() })
            .where(eq(presets.id, id))
            .returning();
        return updatedPreset;
    },

    /**
     * Delete a preset
     */
    delete: async (id: string) => {
        const [deletedPreset] = await db.delete(presets).where(eq(presets.id, id)).returning();
        return deletedPreset;
    }
};
