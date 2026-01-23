import {
    pgTable,
    uuid,
    text,
    boolean,
    timestamp,
    integer,
    pgEnum,
} from 'drizzle-orm/pg-core';
import { routers } from './routers';
import { users } from './users';

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
    createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Netwatch hosts table
export const netwatchHosts = pgTable('netwatch_hosts', {
    id: uuid('id').defaultRandom().primaryKey(),
    routerId: uuid('router_id')
        .notNull()
        .references(() => routers.id, { onDelete: 'cascade' }),
    host: text('host').notNull(),
    name: text('name'),
    comment: text('comment'),
    status: text('status'), // up, down, unknown
    timeout: integer('timeout').default(1000), // ms
    interval: integer('interval').default(10), // seconds
    sinceUp: timestamp('since_up'),
    sinceDown: timestamp('since_down'),
    disabled: boolean('disabled').default(false),
    lastUpdated: timestamp('last_updated').defaultNow(),
});

// Types
export type Alert = typeof alerts.$inferSelect;
export type NewAlert = typeof alerts.$inferInsert;
export type NetwatchHost = typeof netwatchHosts.$inferSelect;
export type NewNetwatchHost = typeof netwatchHosts.$inferInsert;
