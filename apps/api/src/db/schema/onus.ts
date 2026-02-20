import {
    pgTable,
    uuid,
    text,
    decimal,
    timestamp,
    pgEnum,
    json,
    index,
} from 'drizzle-orm/pg-core';
import { olts } from './olts.js';

export const onuStatusEnum = pgEnum('onu_status', [
    'online',
    'offline',
    'lost',
    'power_down',
    'dying_gasp',
    'unknown',
]);

// ONUs table - Master hardware inventory
export const onus = pgTable('onus', {
    id: uuid('id').defaultRandom().primaryKey(),
    sn: text('sn').notNull().unique(), // Serial Number - Main Key
    oltId: uuid('olt_id')
        .references(() => olts.id, { onDelete: 'set null' }),
    ponPort: text('pon_port'), // Physical port (e.g. gpon0/1)
    onuIndex: text('onu_index'), // Index on OLT
    macAddress: text('mac_address'), // ONU MAC Address

    name: text('name'), // Customer / Device name
    model: text('model'), // Device Model
    ssid: text('ssid'), // WiFi SSID
    firmwareVersion: text('firmware_version'), // Firmware Version
    host: text('host'), // Management IP (Last known)

    // Physical Metrics
    lastRxPower: text('last_rx_power'),
    status: onuStatusEnum('status').default('unknown').notNull(),
    lastSeen: timestamp('last_seen'),
    lastDownReason: text('last_down_reason'),

    // Map Location
    latitude: decimal('latitude', { precision: 10, scale: 7 }),
    longitude: decimal('longitude', { precision: 10, scale: 7 }),
    location: text('location'),

    // Connection Topology
    connectionType: text('connection_type').default('router'), // 'router' or 'client'
    connectedToId: uuid('connected_to_id'), // ID of the device this is connected to
    waypoints: text('waypoints'), // JSON string: [[lat1, lng1], [lat2, lng2], ...]

    // Traffic Mapping (Experimental for Passive)
    targetInterface: text('target_interface'),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),

    // Data Sources Tracking
    discoverySources: json('discovery_sources').$type<string[]>().default([]),
}, (table) => ({
    oltIdIdx: index('onus_olt_id_idx').on(table.oltId),
    statusIdx: index('onus_status_idx').on(table.status),
}));

export type Onu = typeof onus.$inferSelect;
export type NewOnu = typeof onus.$inferInsert;
