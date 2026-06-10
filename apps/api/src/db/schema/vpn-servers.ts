import {
    pgTable,
    uuid,
    text,
    integer,
    boolean,
    timestamp,
    index,
    uniqueIndex,
} from 'drizzle-orm/pg-core';
import { users } from './users.js';

/**
 * VPN Servers table — multi-VPN-server management.
 *
 * Each row represents a remote VPN endpoint that the app dials OUT to,
 * acting as a VPN client. Routers behind each VPN server are reachable
 * via the assigned `client_subnet` once the tunnel is up.
 *
 * Shared across tenants: routers in any tenant can reference any VPN
 * server. There is intentionally no `tenant_id` here — tenant scoping
 * happens at the router level.
 *
 * Phase 3 of VPN management. See plan doc for full architecture.
 */
export const vpnServers = pgTable('vpn_servers', {
    id: uuid('id').defaultRandom().primaryKey(),

    // === Basic info ===
    name: text('name').notNull(),                                // "VPN Jakarta" — UNIQUE
    region: text('region'),                                       // "Jakarta", optional tag
    type: text('type').notNull(),                                 // 'openvpn' (future: 'l2tp', 'sstp')
    enabled: boolean('enabled').notNull().default(true),
    priority: integer('priority').notNull().default(5),           // 1-9 for sort + reconnect order
    notes: text('notes'),

    // === Connection ===
    host: text('host').notNull(),                                 // "id.genster.net" or IP
    port: integer('port').notNull(),                              // 1119
    proto: text('proto').notNull().default('tcp'),                // 'tcp' | 'udp'

    // === Credentials ===
    // username plain (not secret), password encrypted via lib/encryption.ts
    username: text('username').notNull(),
    passwordEncrypted: text('password_encrypted').notNull(),

    // === OpenVPN-specific options ===
    mode: text('mode').notNull().default('tap'),                  // 'tap' | 'tun'
    cipher: text('cipher').notNull().default('AES-256-CBC'),
    auth: text('auth').notNull().default('SHA1'),
    caCertPem: text('ca_cert_pem'),                               // PEM CA cert (nullable)
    verifyServerCert: boolean('verify_server_cert').notNull().default(true),
    // Extra OpenVPN directives, validated by whitelist at write time.
    // One directive per line, e.g. "tls-version-min 1.0\nauth-nocache".
    extraConfig: text('extra_config'),

    // === Network ===
    // CIDR of clients behind this VPN — UNIQUE to prevent routing conflicts
    clientSubnet: text('client_subnet').notNull(),                // "172.18.19.0/24"

    // === Status (managed by connection-manager service) ===
    // 'connected' | 'connecting' | 'disconnected' | 'error' | 'disabled'
    status: text('status').notNull().default('disabled'),
    tunnelIp: text('tunnel_ip'),                                  // IP app received from server, e.g. "172.18.19.10"
    lastConnectedAt: timestamp('last_connected_at'),
    lastDisconnectedAt: timestamp('last_disconnected_at'),
    lastError: text('last_error'),
    lastCheckedAt: timestamp('last_checked_at'),
    connectionAttempts: integer('connection_attempts').notNull().default(0),

    // === Audit ===
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
    uniqueClientSubnet: uniqueIndex('vpn_servers_client_subnet_unique').on(table.clientSubnet),
    uniqueName: uniqueIndex('vpn_servers_name_unique').on(table.name),
    statusIdx: index('vpn_servers_status_idx').on(table.status),
    enabledIdx: index('vpn_servers_enabled_idx').on(table.enabled),
}));

// Types
export type VpnServer = typeof vpnServers.$inferSelect;
export type NewVpnServer = typeof vpnServers.$inferInsert;
