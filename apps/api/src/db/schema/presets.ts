import {
    pgTable,
    uuid,
    text,
    timestamp,
    jsonb,
    pgEnum,
} from 'drizzle-orm/pg-core';

export const presetTypeEnum = pgEnum('preset_type', [
    'wan',
    'wifi',
]);

export const presets = pgTable('presets', {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull(),
    description: text('description'),
    type: presetTypeEnum('type').notNull(), // 'wan' or 'wifi'
    config: jsonb('config').notNull(), // Stores the payload for WAN or WiFi config
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export type Preset = typeof presets.$inferSelect;
export type NewPreset = typeof presets.$inferInsert;
