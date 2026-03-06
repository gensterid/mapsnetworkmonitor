import {
    pgTable,
    uuid,
    text,
    timestamp,
    real,
    index,
} from 'drizzle-orm/pg-core';
import { routers } from './routers.js';
import { tenants } from './tenants.js';
import { onus } from './onus.js';

/**
 * Device Performance History
 * Tracks time-series data for latency and signal (Rx Power)
 * for both MikroTik Netwatch hosts and ONUs.
 */
export const devicePerformanceHistory = pgTable('device_performance_history', {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id')
        .notNull()
        .references(() => tenants.id, { onDelete: 'cascade' }),
    routerId: uuid('router_id')
        .notNull()
        .references(() => routers.id, { onDelete: 'cascade' }),

    // Identifier for the target
    host: text('host'), // IP address for Netwatch hosts
    onuId: uuid('onu_id').references(() => onus.id, { onDelete: 'cascade' }), // ID for OLT ONUs

    // Metrics
    latency: real('latency'), // Latency in ms
    signal: real('signal'), // Signal / Rx Power in dBm

    recordedAt: timestamp('recorded_at').defaultNow().notNull(),
}, (table) => ({
    routerIdIdx: index('dev_perf_router_id_idx').on(table.routerId),
    tenantIdIdx: index('dev_perf_tenant_id_idx').on(table.tenantId),
    hostIdx: index('dev_perf_host_idx').on(table.host),
    onuIdIdx: index('dev_perf_onu_id_idx').on(table.onuId),
    recordedAtIdx: index('dev_perf_recorded_at_idx').on(table.recordedAt),
}));

export type DevicePerformanceHistory = typeof devicePerformanceHistory.$inferSelect;
export type NewDevicePerformanceHistory = typeof devicePerformanceHistory.$inferInsert;
