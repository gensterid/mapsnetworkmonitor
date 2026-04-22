import {
    pgTable,
    uuid,
    text,
    decimal,
    timestamp,
    pgEnum,
    json,
    index,
    integer,
    foreignKey,
} from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';
import { olts } from './olts.js';
import { routers } from './routers.js';

export const onusStatusEnum = pgEnum('onu_status', [
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
    tenantId: uuid('tenant_id').references(() => tenants.id),
    sn: text('sn').notNull().unique(), // Serial Number - Main Key
    oltId: uuid('olt_id')
        .references(() => olts.id, { onDelete: 'set null' }),
    routerId: uuid('router_id')
        .references(() => routers.id, { onDelete: 'set null' }),
    ponPort: text('pon_port'), // Physical port (e.g. gpon0/1)
    onuIndex: text('onu_index'), // Index on OLT
    macAddress: text('mac_address'), // ONU MAC Address

    name: text('name'), // Customer / Device name
    description: text('description'), // Description from OLT
    model: text('model'), // Device Model
    ssid: text('ssid'), // WiFi SSID
    firmwareVersion: text('firmware_version'), // Firmware Version
    host: text('host'), // Management IP (Last known)

    // Physical Metrics
    lastRxPower: text('last_rx_power'),
    status: onusStatusEnum('status').default('unknown').notNull(),
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
    
    // GenieACS Automated Provisioning data
    pppoeUser: text('pppoe_user'),
    pppoePass: text('pppoe_pass'),
    vlanId: integer('vlan_id'),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),

    // Soft-delete for ghost ONU cleanup. NULL = active.
    // Set when ONU has been offline past retention period.
    // Hard-delete happens after 2x retention period.
    // Auto-cleared when the same SN reappears in polling.
    archivedAt: timestamp('archived_at'),

    // Data Sources Tracking
    discoverySources: json('discovery_sources').$type<string[]>().default([]),
}, (table) => ({
    oltIdIdx: index('onus_olt_id_idx').on(table.oltId),
    routerIdIdx: index('onus_router_id_idx').on(table.routerId),
    statusIdx: index('onus_status_idx').on(table.status),
    archivedAtIdx: index('onus_archived_at_idx').on(table.archivedAt),
}));

export type Onu = typeof onus.$inferSelect;
export type NewOnu = typeof onus.$inferInsert;
