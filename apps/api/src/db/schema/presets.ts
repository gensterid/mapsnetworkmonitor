import {
    pgTable,
    uuid,
    text,
    timestamp,
    jsonb,
    pgEnum,
    index,
} from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';

export const presetTypeEnum = pgEnum('preset_type', [
    'wan',
    'wifi',
]);

export const presets = pgTable('presets', {
    id: uuid('id').defaultRandom().primaryKey(),
    // Tenant-scoped (audit isolasi tenant). Nullable = preset global/legacy.
    tenantId: uuid('tenant_id').references(() => tenants.id),
    name: text('name').notNull(),
    description: text('description'),
    type: presetTypeEnum('type').notNull(), // 'wan' or 'wifi'
    config: jsonb('config').notNull(), // Stores the payload for WAN or WiFi config
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
    tenantIdIdx: index('presets_tenant_id_idx').on(table.tenantId),
}));

export type Preset = typeof presets.$inferSelect;
export type NewPreset = typeof presets.$inferInsert;
