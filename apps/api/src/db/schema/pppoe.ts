import {
    pgTable,
    uuid,
    text,
    timestamp,
    integer,
    bigint,
    index,
} from 'drizzle-orm/pg-core';
import { routers } from './routers.js';

// PPPoE Sessions table - tracks active PPPoE sessions for detecting connect/disconnect
export const pppoeSessions = pgTable('pppoe_sessions', {
    id: uuid('id').defaultRandom().primaryKey(),
    routerId: uuid('router_id')
        .notNull()
        .references(() => routers.id, { onDelete: 'cascade' }),
    name: text('name').notNull(), // PPPoE username
    sessionId: text('session_id'), // MikroTik session ID
    callerId: text('caller_id'), // MAC or calling station ID
    address: text('address'), // Assigned IP address
    service: text('service'), // Service type (pppoe, pptp, etc.)
    uptime: text('uptime'), // Current uptime string from MikroTik
    latitude: text('latitude'), // Location latitude for map display
    longitude: text('longitude'), // Location longitude for map display
    waypoints: text('waypoints'), // JSON string of waypoints for map line
    connectionType: text('connection_type').default('router'), // 'router' or 'client'
    connectedToId: uuid('connected_to_id'), // ID of client/device connected to (if connectionType is 'client')
    connectedAt: timestamp('connected_at').defaultNow().notNull(),
    lastSeen: timestamp('last_seen').defaultNow().notNull(),
    // Status tracking
    status: text('status').default('active'), // 'active', 'disconnected'
    lastDown: timestamp('last_down'),
    lastLatency: integer('last_latency'), // Latency in ms (if available)

    // Traffic Stats
    txBytes: bigint('tx_bytes', { mode: 'number' }).default(0),
    rxBytes: bigint('rx_bytes', { mode: 'number' }).default(0),
    txRate: bigint('tx_rate', { mode: 'number' }).default(0), // bits per second
    rxRate: bigint('rx_rate', { mode: 'number' }).default(0), // bits per second
    lastTrafficUpdate: timestamp('last_traffic_update'),
}, (table) => ({
    routerIdIdx: index('pppoe_sessions_router_id_idx').on(table.routerId),
    nameIdx: index('pppoe_sessions_name_idx').on(table.name),
    statusIdx: index('pppoe_sessions_status_idx').on(table.status),
    connectedAtIdx: index('pppoe_sessions_connected_at_idx').on(table.connectedAt),
}));

// Types
export type PppoeSession = typeof pppoeSessions.$inferSelect;
export type NewPppoeSession = typeof pppoeSessions.$inferInsert;
