import {
    pgTable,
    uuid,
    text,
    timestamp,
    bigint,
    pgEnum,
    index,
} from 'drizzle-orm/pg-core';
import { routers } from './routers.js';
import { tenants } from './tenants.js';

// Backup type enum
export const backupTypeEnum = pgEnum('router_backup_type', [
    'backup', // Binary .backup
    'rsc',    // Export script .rsc
    'json',   // Custom API Snapshot
    'email',  // Direct-to-Email report
]);

// Router Backups table
export const routerBackups = pgTable('router_backups', {
    id: uuid('id').defaultRandom().primaryKey(),
    routerId: uuid('router_id')
        .notNull()
        .references(() => routers.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id')
        .notNull()
        .references(() => tenants.id, { onDelete: 'cascade' }),
    
    filename: text('filename').notNull(),
    type: backupTypeEnum('type').notNull(),
    size: bigint('size', { mode: 'number' }).default(0),
    comment: text('comment'),
    
    createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
    routerIdIdx: index('router_backups_router_id_idx').on(table.routerId),
    tenantIdIdx: index('router_backups_tenant_id_idx').on(table.tenantId),
    createdAtIdx: index('router_backups_created_at_idx').on(table.createdAt),
}));

export type RouterBackup = typeof routerBackups.$inferSelect;
export type NewRouterBackup = typeof routerBackups.$inferInsert;
