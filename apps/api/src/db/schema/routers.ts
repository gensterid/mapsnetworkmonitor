import {
    pgTable,
    uuid,
    text,
    integer,
    decimal,
    timestamp,
    bigint,
    boolean,
    real,
    pgEnum,
} from 'drizzle-orm/pg-core';
import { routerGroups } from './groups';
import { notificationGroups } from './notifications';

// Router status enum
export const routerStatusEnum = pgEnum('router_status', [
    'online',
    'offline',
    'maintenance',
    'unknown',
]);

// Routers table
export const routers = pgTable('routers', {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull(),
    host: text('host').notNull(),
    port: integer('port').notNull().default(8728),
    username: text('username').notNull(),
    passwordEncrypted: text('password_encrypted').notNull(),

    // Router info (fetched from RouterOS)
    routerOsVersion: text('router_os_version'),
    model: text('model'),
    serialNumber: text('serial_number'),
    identity: text('identity'),
    boardName: text('board_name'),
    architecture: text('architecture'),

    // Location
    latitude: decimal('latitude', { precision: 10, scale: 7 }),
    longitude: decimal('longitude', { precision: 10, scale: 7 }),
    location: text('location'),
    locationImage: text('location_image'),

    // Status
    status: routerStatusEnum('status').notNull().default('unknown'),
    latency: integer('latency'), // Latency in ms
    groupId: uuid('group_id').references(() => routerGroups.id, {
        onDelete: 'set null',
    }),
    notificationGroupId: uuid('notification_group_id').references(() => notificationGroups.id, {
        onDelete: 'set null',
    }),

    // Notes
    notes: text('notes'),

    // Timestamps
    lastSeen: timestamp('last_seen'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Router interfaces table
export const routerInterfaces = pgTable('router_interfaces', {
    id: uuid('id').defaultRandom().primaryKey(),
    routerId: uuid('router_id')
        .notNull()
        .references(() => routers.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    defaultName: text('default_name'),
    type: text('type'), // ether, wlan, bridge, vlan, pppoe-out, etc.
    macAddress: text('mac_address'),
    status: text('status'), // up, down, disabled
    txBytes: bigint('tx_bytes', { mode: 'number' }).default(0),
    rxBytes: bigint('rx_bytes', { mode: 'number' }).default(0),
    txPackets: bigint('tx_packets', { mode: 'number' }).default(0),
    rxPackets: bigint('rx_packets', { mode: 'number' }).default(0),
    txDrops: bigint('tx_drops', { mode: 'number' }).default(0),
    rxDrops: bigint('rx_drops', { mode: 'number' }).default(0),
    txErrors: bigint('tx_errors', { mode: 'number' }).default(0),
    rxErrors: bigint('rx_errors', { mode: 'number' }).default(0),
    txRate: bigint('tx_rate', { mode: 'number' }).default(0), // bits per second
    rxRate: bigint('rx_rate', { mode: 'number' }).default(0), // bits per second
    speed: text('speed'), // 100Mbps, 1Gbps, etc.
    running: boolean('running').default(false),
    disabled: boolean('disabled').default(false),
    comment: text('comment'),
    lastUpdated: timestamp('last_updated').defaultNow(),
});

// Router metrics table (time-series data)
export const routerMetrics = pgTable('router_metrics', {
    id: uuid('id').defaultRandom().primaryKey(),
    routerId: uuid('router_id')
        .notNull()
        .references(() => routers.id, { onDelete: 'cascade' }),
    cpuLoad: real('cpu_load'),
    cpuCount: integer('cpu_count'),
    cpuFrequency: integer('cpu_frequency'),
    totalMemory: bigint('total_memory', { mode: 'number' }),
    usedMemory: bigint('used_memory', { mode: 'number' }),
    freeMemory: bigint('free_memory', { mode: 'number' }),
    totalDisk: bigint('total_disk', { mode: 'number' }),
    usedDisk: bigint('used_disk', { mode: 'number' }),
    freeDisk: bigint('free_disk', { mode: 'number' }),
    uptime: integer('uptime'), // in seconds
    temperature: real('temperature'),
    voltage: real('voltage'),
    boardTemp: real('board_temp'),
    currentFirmware: text('current_firmware'),
    upgradeFirmware: text('upgrade_firmware'),
    recordedAt: timestamp('recorded_at').defaultNow().notNull(),
});

// Netwatch status enum
export const netwatchStatusEnum = pgEnum('netwatch_status', [
    'up',
    'down',
    'unknown',
]);

// Device type enum for OLT, ODP, client nodes
export const deviceTypeEnum = pgEnum('device_type', [
    'client',
    'olt',
    'odp',
]);

// Netwatch table for IP monitoring
export const routerNetwatch = pgTable('router_netwatch', {
    id: uuid('id').defaultRandom().primaryKey(),
    routerId: uuid('router_id')
        .notNull()
        .references(() => routers.id, { onDelete: 'cascade' }),
    host: text('host').notNull(),
    name: text('name'),
    deviceType: deviceTypeEnum('device_type').default('client'), // Type: client, olt, odp
    interval: integer('interval').default(30), // check interval in seconds
    status: netwatchStatusEnum('status').default('unknown'),
    latency: integer('latency'), // Latency in ms
    lastKnownLatency: integer('last_known_latency'), // Last recorded latency before effective down
    packetLoss: integer('packet_loss').default(0), // Packet loss percentage
    lastCheck: timestamp('last_check'),
    lastUp: timestamp('last_up'),
    lastDown: timestamp('last_down'),
    // Location for map display
    latitude: decimal('latitude', { precision: 10, scale: 7 }),
    longitude: decimal('longitude', { precision: 10, scale: 7 }),
    location: text('location'),
    // Connection Topology
    connectionType: text('connection_type').default('router'), // 'router' or 'client'
    connectedToId: uuid('connected_to_id'), // ID of the device this is connected to (router or other netwatch)

    // Waypoints for custom path on map (JSON array of [lat, lng] coordinates)
    waypoints: text('waypoints'), // JSON string: [[lat1, lng1], [lat2, lng2], ...]
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Types
export type Router = typeof routers.$inferSelect;
export type NewRouter = typeof routers.$inferInsert;
export type RouterInterface = typeof routerInterfaces.$inferSelect;
export type NewRouterInterface = typeof routerInterfaces.$inferInsert;
export type RouterMetric = typeof routerMetrics.$inferSelect;
export type NewRouterMetric = typeof routerMetrics.$inferInsert;
export type RouterNetwatch = typeof routerNetwatch.$inferSelect;
export type NewRouterNetwatch = typeof routerNetwatch.$inferInsert;
