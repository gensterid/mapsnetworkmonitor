import {
    pgTable,
    uuid,
    timestamp,
    bigint,
    index,
} from 'drizzle-orm/pg-core';
import { routerInterfaces, routers } from './routers.js';
import { tenants } from './tenants.js';

/**
 * Router Interface Metrics History
 * Tracks time-series data for interface TX/RX rates.
 */
export const routerInterfaceMetrics = pgTable('router_interface_metrics', {
    id: uuid('id').defaultRandom().primaryKey(),
    interfaceId: uuid('interface_id')
        .notNull()
        .references(() => routerInterfaces.id, { onDelete: 'cascade' }),
    
    // Metrics
    txRate: bigint('tx_rate', { mode: 'number' }).default(0), // bits per second
    rxRate: bigint('rx_rate', { mode: 'number' }).default(0), // bits per second

    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),
    recordedAt: timestamp('recorded_at').defaultNow().notNull(),
}, (table) => ({
    interfaceIdIdx: index('router_if_metrics_interface_id_idx').on(table.interfaceId),
    tenantIdIdx: index('router_if_metrics_tenant_id_idx').on(table.tenantId),
    recordedAtIdx: index('router_if_metrics_recorded_at_idx').on(table.recordedAt),
}));

export type RouterInterfaceMetric = typeof routerInterfaceMetrics.$inferSelect;
export type NewRouterInterfaceMetric = typeof routerInterfaceMetrics.$inferInsert;
