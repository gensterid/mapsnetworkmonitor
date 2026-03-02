import {
    pgTable,
    uuid,
    text,
    integer,
    decimal,
    timestamp,
    pgEnum,
    boolean,
    index,
} from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';

export const oltTypeEnum = pgEnum('olt_type', ['hsgq', 'cdata', 'generic']);
export const oltStatusEnum = pgEnum('olt_status', ['online', 'offline', 'unknown']);

export const olts = pgTable('olts', {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').references(() => tenants.id),
    name: text('name').notNull(),
    host: text('host').notNull(),
    snmpPort: integer('snmp_port').default(161).notNull(),
    snmpCommunity: text('snmp_community').default('public').notNull(),
    type: oltTypeEnum('type').default('generic').notNull(),
    status: oltStatusEnum('status').default('unknown').notNull(),
    parentId: uuid('parent_id'), // Link to parent router

    // Web/API Configuration
    webPort: integer('web_port').default(80),
    webUsername: text('web_username'),
    webPassword: text('web_password'), // Should be encrypted
    webProtocol: text('web_protocol').default('http'), // 'http' or 'https'

    // Protocol Flags
    useSnmp: boolean('use_snmp').default(true).notNull(),
    useWeb: boolean('use_web').default(false).notNull(),
    activeProtocol: text('active_protocol'), // 'snmp' or 'web'
    lastSnmpStatus: text('last_snmp_status'), // 'online', 'offline'
    lastWebStatus: text('last_web_status'), // 'online', 'offline'

    uptime: integer('uptime'), // in seconds
    description: text('description'),
    // Location
    latitude: decimal('latitude', { precision: 10, scale: 7 }),
    longitude: decimal('longitude', { precision: 10, scale: 7 }),

    // Topology Schematic
    topologyX: decimal('topology_x', { precision: 10, scale: 2 }),
    topologyY: decimal('topology_y', { precision: 10, scale: 2 }),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
    parentIdIdx: index('olts_parent_id_idx').on(table.parentId),
    hostIdx: index('olts_host_idx').on(table.host),
    statusIdx: index('olts_status_idx').on(table.status),
}));

export type Olt = typeof olts.$inferSelect;
export type NewOlt = typeof olts.$inferInsert;
