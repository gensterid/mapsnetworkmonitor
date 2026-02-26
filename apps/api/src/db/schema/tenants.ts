import { pgTable, uuid, text, timestamp } from 'drizzle-orm/pg-core';

/**
 * Tenants table to support Multi-ISP / Multi-Tenancy
 * Each tenant represents an independent ISP with its own routers, users, and settings.
 */
export const tenants = pgTable('tenants', {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull(),
    slug: text('slug').notNull().unique(), // e.g. 'isp-maju-jaya'
    description: text('description'),
    settings: text('settings'), // JSON string for tenant-specific configuration
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Types
export type Tenant = typeof tenants.$inferSelect;
export type NewTenant = typeof tenants.$inferInsert;
