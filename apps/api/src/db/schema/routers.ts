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
    index,
    primaryKey,
} from 'drizzle-orm/pg-core';
import { routerGroups } from './groups.js';
import { notificationGroups } from './notifications.js';
import { tenants } from './tenants.js';

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
    tenantId: uuid('tenant_id').references(() => tenants.id),
    name: text('name').notNull(),
    host: text('host').notNull(),
    port: integer('port').notNull().default(8728),
    username: text('username').notNull(),
    passwordEncrypted: text('password_encrypted').notNull(),

    // SNMP Configuration
    useSnmp: boolean('use_snmp').default(true).notNull(),
    snmpCommunity: text('snmp_community').default('public'),
    snmpPort: integer('snmp_port').default(161),
    snmpHost: text('snmp_host'), // Optional custom host for SNMP polling


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
    
    // SNMP Status Indication
    snmpStatus: text('snmp_status').default('unknown'),
    lastSnmpError: text('last_snmp_error'),

    groupId: uuid('group_id').references(() => routerGroups.id, {
        onDelete: 'set null',
    }),
    notificationGroupId: uuid('notification_group_id').references(() => notificationGroups.id, {
        onDelete: 'set null',
    }),

    // Notes
    notes: text('notes'),

    // Hybrid Monitoring (Webhook + API)
    useWebhook: boolean('use_webhook').default(false).notNull(),
    webhookSecret: text('webhook_secret'), // Generated token for secure webhook endpoint
    pollingIntervalMetrics: integer('polling_interval_metrics').default(300).notNull(), // Interval for traffic/resources in seconds

    // GenieACS Integration
    useGenieAcs: boolean('use_genieacs').default(false).notNull(),
    genieacsUrl: text('genieacs_url'),
    genieacsUsername: text('genieacs_username'),
    genieacsPasswordEncrypted: text('genieacs_password_encrypted'),

    // RoMON & Neighbor Discovery
    gatewayId: uuid('gateway_id').references((): any => routers.id), // UUID of another router record acting as RoMON gateway
    romonMac: text('romon_mac'), // MAC address of the target router in the RoMON network
    parentInterface: text('parent_interface'), // The port on the GATEWAY router this router is connected to
    lastNeighborsSync: timestamp('last_neighbors_sync'),

    // Topology Schematic (Independent of geographic lat/lng)
    topologyX: decimal('topology_x', { precision: 10, scale: 2 }),
    topologyY: decimal('topology_y', { precision: 10, scale: 2 }),

    // Automated Email Backup SMTP Settings
    emailSmtpServer: text('email_smtp_server'),
    emailSmtpPort: integer('email_smtp_port'),
    emailSmtpUser: text('email_smtp_user'),
    emailSmtpPassEncrypted: text('email_smtp_pass_encrypted'),
    emailSmtpRecipient: text('email_smtp_recipient'),
    emailSmtpInterval: text('email_smtp_interval'),
    emailSmtpTls: boolean('email_smtp_tls').default(true),
    emailSmtpStartTime: text('email_smtp_start_time'),
    emailSmtpExportDelay: integer('email_smtp_export_delay').default(10),
    emailSmtpCleanupDelay: integer('email_smtp_cleanup_delay').default(30),

    // Timestamps
    lastSeen: timestamp('last_seen'),
    lastFullSync: timestamp('last_full_sync'),
    lastErrorMessage: text('last_error_message'), // Detailed failure reason (Wrong password, Timeout, etc)
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
    hostIdx: index('routers_host_idx').on(table.host),
    statusIdx: index('routers_status_idx').on(table.status),
    groupIdIdx: index('routers_group_id_idx').on(table.groupId),
}));

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
    lastTrafficAt: timestamp('last_traffic_at'), // Dedicated timebase for rate calculation
    lastUpdated: timestamp('last_updated').defaultNow(),
}, (table) => ({
    routerIdIdx: index('router_interfaces_router_id_idx').on(table.routerId),
    combinedIdx: index('router_interfaces_combined_idx').on(table.routerId, table.name),
}));

// Router metrics table (time-series data)
export const routerMetrics = pgTable('router_metrics', {
    id: uuid('id').defaultRandom().notNull(),
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
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),
    recordedAt: timestamp('recorded_at').defaultNow().notNull(),
}, (table) => ({
    routerIdIdx: index('router_metrics_router_id_idx').on(table.routerId),
    tenantIdIdx: index('router_metrics_tenant_id_idx').on(table.tenantId),
    recordedAtIdx: index('router_metrics_recorded_at_idx').on(table.recordedAt),
    combinedIdx: index('router_metrics_combined_idx').on(table.routerId, table.recordedAt),
    recordedAtDescIdx: index('router_metrics_recorded_at_desc_idx').on(table.recordedAt.desc()),
    pk: primaryKey({ columns: [table.id, table.recordedAt] }),
}));

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
    'router',
    'switch',
]);

// Netwatch table for IP monitoring
export const routerNetwatch = pgTable('router_netwatch', {
    id: uuid('id').defaultRandom().primaryKey(),
    routerId: uuid('router_id')
        .notNull()
        .references(() => routers.id, { onDelete: 'cascade' }),
    host: text('host'),
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

    // Traffic Mapping
    targetInterface: text('target_interface'), // Interface name for traffic mapping (e.g. ether1)
    txRate: bigint('tx_rate', { mode: 'number' }).default(0), // bits per second
    rxRate: bigint('rx_rate', { mode: 'number' }).default(0), // bits per second


    // Waypoints for custom path on map (JSON array of [lat, lng] coordinates)
    waypoints: text('waypoints'), // JSON string: [[lat1, lng1], [lat2, lng2], ...]

    // Manual Link to ONU Inventory
    linkedOnuId: uuid('linked_onu_id'),

    // Topology Schematic (Independent of geographic lat/lng)
    topologyX: decimal('topology_x', { precision: 10, scale: 2 }),
    topologyY: decimal('topology_y', { precision: 10, scale: 2 }),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    hasWebhook: boolean('has_webhook').default(false).notNull(),
    isAppOnly: boolean('is_app_only').default(false).notNull(),
    disabled: boolean('disabled').default(false).notNull(),
    portCapacity: integer('port_capacity').default(8),
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),
}, (table) => ({
    routerIdIdx: index('router_netwatch_router_id_idx').on(table.routerId),
    tenantIdIdx: index('router_netwatch_tenant_id_idx').on(table.tenantId),
    hostIdx: index('router_netwatch_host_idx').on(table.host),
    statusIdx: index('router_netwatch_status_idx').on(table.status),
    routerStatusIdx: index('router_netwatch_router_status_idx').on(table.routerId, table.status),
    lastUpIdx: index('router_netwatch_last_up_idx').on(table.lastUp),
    lastDownIdx: index('router_netwatch_last_down_idx').on(table.lastDown),
}));

// Types
export type Router = typeof routers.$inferSelect;
export type NewRouter = typeof routers.$inferInsert;
export type RouterInterface = typeof routerInterfaces.$inferSelect;
export type NewRouterInterface = typeof routerInterfaces.$inferInsert;
export type RouterMetric = typeof routerMetrics.$inferSelect;
export type NewRouterMetric = typeof routerMetrics.$inferInsert;
export type RouterNetwatch = typeof routerNetwatch.$inferSelect;
export type NewRouterNetwatch = typeof routerNetwatch.$inferInsert;
