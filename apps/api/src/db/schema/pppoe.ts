import {
    pgTable,
    uuid,
    text,
    timestamp,
} from 'drizzle-orm/pg-core';
import { routers } from './routers';

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
});

// Types
export type PppoeSession = typeof pppoeSessions.$inferSelect;
export type NewPppoeSession = typeof pppoeSessions.$inferInsert;
