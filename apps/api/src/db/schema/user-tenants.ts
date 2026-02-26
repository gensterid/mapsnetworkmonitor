import { pgTable, uuid, primaryKey } from 'drizzle-orm/pg-core';
import { users } from './users.js';
import { tenants } from './tenants.js';

/**
 * User Tenants mapping table
 * Allows users to have access to multiple ISPs/Tenants
 */
export const userTenants = pgTable('user_tenants', {
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
}, (table) => ({
    pk: primaryKey({ columns: [table.userId, table.tenantId] }),
}));

export type UserTenant = typeof userTenants.$inferSelect;
export type NewUserTenant = typeof userTenants.$inferInsert;
