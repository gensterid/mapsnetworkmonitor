import {
    pgTable,
    uuid,
    text,
    boolean,
    timestamp,
    integer,
    decimal,
    pgEnum,
    index,
} from 'drizzle-orm/pg-core';
import { routers } from './routers.js';
import { users } from './users.js';
import { tenants } from './tenants.js';

// Alert type enum
export const alertTypeEnum = pgEnum('alert_type', [
    'status_change',
    'high_cpu',
    'high_memory',
    'high_disk',
    'interface_down',
    'netwatch_down',
    'threshold',
    'reboot',
    'pppoe_connect',
    'pppoe_disconnect',
    'system',
    'high_latency',
    'packet_loss',
]);

// Alert severity enum
export const alertSeverityEnum = pgEnum('alert_severity', [
    'info',
    'warning',
    'critical',
]);

// Alerts table
export const alerts = pgTable('alerts', {
    id: uuid('id').defaultRandom().primaryKey(),
    routerId: uuid('router_id')
        .notNull()
        .references(() => routers.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id')
        .notNull()
        .references(() => tenants.id, { onDelete: 'cascade' }),
    type: alertTypeEnum('type').notNull(),
    severity: alertSeverityEnum('severity').notNull(),
    title: text('title').notNull(),
    message: text('message').notNull(),
    acknowledged: boolean('acknowledged').default(false).notNull(),
    acknowledgedBy: uuid('acknowledged_by').references(() => users.id, {
        onDelete: 'set null',
    }),
    acknowledgedAt: timestamp('acknowledged_at'),
    resolved: boolean('resolved').default(false).notNull(),
    resolvedAt: timestamp('resolved_at'),
    // Escalation tracking
    escalationLevel: integer('escalation_level').default(0).notNull(),
    lastEscalatedAt: timestamp('last_escalated_at'),
    aiAnalysis: text('ai_analysis'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
}, (table) => ({
    routerIdIdx: index('alerts_router_id_idx').on(table.routerId),
    tenantIdIdx: index('alerts_tenant_id_idx').on(table.tenantId),
    typeIdx: index('alerts_type_idx').on(table.type),
    acknowledgedIdx: index('alerts_acknowledged_idx').on(table.acknowledged),
    resolvedIdx: index('alerts_resolved_idx').on(table.resolved),
    createdAtIdx: index('alerts_created_at_idx').on(table.createdAt),
    // Composite indexes for common query patterns
    tenantAcknowledgedIdx: index('alerts_tenant_acknowledged_idx').on(table.tenantId, table.acknowledged),
    routerResolvedIdx: index('alerts_router_resolved_idx').on(table.routerId, table.resolved),
    routerCreatedAtIdx: index('alerts_router_created_at_idx').on(table.routerId, table.createdAt),
}));

// Netwatch hosts table
export const netwatchHosts = pgTable('netwatch_hosts', {
    id: uuid('id').defaultRandom().primaryKey(),
    routerId: uuid('router_id')
        .notNull()
        .references(() => routers.id, { onDelete: 'cascade' }),
    tenantId: uuid('tenant_id')
        .notNull()
        .references(() => tenants.id, { onDelete: 'cascade' }),
    host: text('host').notNull(),
    name: text('name'),
    comment: text('comment'),
    status: text('status'), // up, down, unknown
    timeout: integer('timeout').default(1000), // ms
    interval: integer('interval').default(10), // seconds

    sinceUp: timestamp('since_up'),
    sinceDown: timestamp('since_down'),
    lastCheck: timestamp('last_check'),
    lastUp: timestamp('last_up'),
    lastDown: timestamp('last_down'),
    latency: integer('latency'),
    lastKnownLatency: integer('last_known_latency'),
    packetLoss: integer('packet_loss').default(0),
    // Location for map display
    latitude: decimal('latitude', { precision: 10, scale: 7 }),
    longitude: decimal('longitude', { precision: 10, scale: 7 }),
    location: text('location'),
    // Metadata
    deviceType: text('device_type'), // client, olt, odp
    waypoints: text('waypoints'),
    connectionType: text('connection_type').default('router'),
    connectedToId: uuid('connected_to_id'),
    disabled: boolean('disabled').default(false),
    lastUpdated: timestamp('last_updated').defaultNow(),
}, (table) => ({
    routerIdIdx: index('netwatch_hosts_router_id_idx').on(table.routerId),
    tenantIdIdx: index('netwatch_hosts_tenant_id_idx').on(table.tenantId),
    hostIdx: index('netwatch_hosts_host_idx').on(table.host),
    statusIdx: index('netwatch_hosts_status_idx').on(table.status),
}));

// Types
export type Alert = typeof alerts.$inferSelect;
export type NewAlert = typeof alerts.$inferInsert;
export type NetwatchHost = typeof netwatchHosts.$inferSelect;
export type NewNetwatchHost = typeof netwatchHosts.$inferInsert;
