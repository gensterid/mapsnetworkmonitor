import { pgTable, uuid, text, jsonb, timestamp } from 'drizzle-orm/pg-core';
import { users } from './users.js';

// Application settings table
export const appSettings = pgTable('app_settings', {
    id: uuid('id').defaultRandom().primaryKey(),
    key: text('key').notNull().unique(),
    value: jsonb('value'),
    description: text('description'),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Audit logs table
export const auditLogs = pgTable('audit_logs', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    action: text('action').notNull(), // create, update, delete, login, logout, reboot
    entity: text('entity').notNull(), // router, user, alert, group, settings, session
    entityId: uuid('entity_id'),
    details: jsonb('details'),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Types
export type AppSetting = typeof appSettings.$inferSelect;
export type NewAppSetting = typeof appSettings.$inferInsert;
export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;
