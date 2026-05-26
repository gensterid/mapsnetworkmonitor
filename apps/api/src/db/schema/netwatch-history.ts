import { pgTable, uuid, text, timestamp, index } from 'drizzle-orm/pg-core';
import { routerNetwatch, routers } from './routers.js';
import { tenants } from './tenants.js';

/**
 * Audit trail of every IP change applied to a router_netwatch entry.
 * Populated by:
 *  - manual edits via UI (reason: 'manual_edit')
 *  - sync-time corrections from MikroTik /tool netwatch (reason: 'sync_correction')
 *  - auto-heal resolver (reason: 'auto_heal_pppoe' | 'auto_heal_acs')
 *  - smart-sync conflict resolution by operator
 *    (reason: 'conflict_resolved_app' | 'conflict_resolved_mikrotik')
 *
 * Used by the per-host History dialog so operators can audit every IP
 * shift over time and spot patterns (e.g. a customer whose IP keeps
 * flipping every reconnect).
 */
export const netwatchIpHistory = pgTable(
    'netwatch_ip_history',
    {
        id: uuid('id').defaultRandom().primaryKey(),
        netwatchId: uuid('netwatch_id')
            .notNull()
            .references(() => routerNetwatch.id, { onDelete: 'cascade' }),
        routerId: uuid('router_id')
            .notNull()
            .references(() => routers.id, { onDelete: 'cascade' }),
        tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),
        oldHost: text('old_host'),
        newHost: text('new_host').notNull(),
        reason: text('reason').notNull(),
        pppoeUser: text('pppoe_user'),
        onuId: uuid('onu_id'),
        changedBy: text('changed_by'),
        changedAt: timestamp('changed_at').defaultNow().notNull(),
    },
    (table) => ({
        netwatchIdx: index('netwatch_history_netwatch_idx').on(table.netwatchId, table.changedAt),
        routerIdx: index('netwatch_history_router_idx').on(table.routerId, table.changedAt),
    })
);

export type NetwatchIpHistory = typeof netwatchIpHistory.$inferSelect;
export type NewNetwatchIpHistory = typeof netwatchIpHistory.$inferInsert;
