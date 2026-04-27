import {
    pgTable,
    uuid,
    text,
    timestamp,
    bigint,
    integer,
    index,
    primaryKey,
} from 'drizzle-orm/pg-core';
import { routers } from './routers.js';
import { tenants } from './tenants.js';

/**
 * Per-client bandwidth deltas (Phase 1).
 *
 * Sumber data:
 *  - PPPoE active (`/ppp active print`) → identifierType='pppoe_user'
 *  - Simple Queue (`/queue simple print`) → identifierType='queue_name' (untuk router non-PPPoE)
 *
 * Counter di RouterOS sifatnya cumulative dalam satu sesi/queue. Service
 * menyimpan delta (bukan cumulative) supaya aggregasi top-N dan grafik per
 * client tinggal SUM tanpa perlu menalaah reset.
 */
export const clientBandwidthHistory = pgTable('client_bandwidth_history', {
    id: uuid('id').defaultRandom().notNull(),
    tenantId: uuid('tenant_id')
        .notNull()
        .references(() => tenants.id, { onDelete: 'cascade' }),
    routerId: uuid('router_id')
        .notNull()
        .references(() => routers.id, { onDelete: 'cascade' }),

    identifier: text('identifier').notNull(),
    identifierType: text('identifier_type').notNull(),

    txBytesDelta: bigint('tx_bytes_delta', { mode: 'number' }).notNull(),
    rxBytesDelta: bigint('rx_bytes_delta', { mode: 'number' }).notNull(),

    intervalSeconds: integer('interval_seconds').notNull(),

    recordedAt: timestamp('recorded_at').defaultNow().notNull(),
}, (table) => ({
    tenantRouterRecordedIdx: index('cbw_tenant_router_recorded_idx')
        .on(table.tenantId, table.routerId, table.recordedAt),
    tenantRouterIdentifierIdx: index('cbw_tenant_router_identifier_recorded_idx')
        .on(table.tenantId, table.routerId, table.identifier, table.recordedAt),
    recordedAtIdx: index('cbw_recorded_at_idx').on(table.recordedAt),
    pk: primaryKey({ columns: [table.id, table.recordedAt] }),
}));

export type ClientBandwidthHistory = typeof clientBandwidthHistory.$inferSelect;
export type NewClientBandwidthHistory = typeof clientBandwidthHistory.$inferInsert;
