import { pgTable, uuid, text, jsonb, timestamp, index, unique } from 'drizzle-orm/pg-core';
import { users } from './users.js';
import { tenants } from './tenants.js';

// Application settings table
export const appSettings = pgTable('app_settings', {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    value: jsonb('value'),
    description: text('description'),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
    tenantIdIdx: index('app_settings_tenant_id_idx').on(table.tenantId),
    tenantKeyUnique: unique('app_settings_tenant_key_unique').on(table.tenantId, table.key),
}));

// Audit logs table
export const auditLogs = pgTable('audit_logs', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),
    action: text('action').notNull(), // create, update, delete, login, logout, reboot
    entity: text('entity').notNull(), // router, user, alert, group, settings, session
    entityId: uuid('entity_id'),
    details: jsonb('details'),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
    userIdIdx: index('audit_logs_user_id_idx').on(table.userId),
    tenantIdIdx: index('audit_logs_tenant_id_idx').on(table.tenantId),
    entityIdx: index('audit_logs_entity_idx').on(table.entity),
    entityIdIdx: index('audit_logs_entity_id_idx').on(table.entityId),
    createdAtIdx: index('audit_logs_created_at_idx').on(table.createdAt),
}));

// Types
export type AppSetting = typeof appSettings.$inferSelect;
export type NewAppSetting = typeof appSettings.$inferInsert;
export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;
