import {
    pgTable,
    uuid,
    text,
    integer,
    timestamp,
    pgEnum,
    boolean,
} from 'drizzle-orm/pg-core';

export const oltTypeEnum = pgEnum('olt_type', ['hsgq', 'cdata', 'generic']);
export const oltStatusEnum = pgEnum('olt_status', ['online', 'offline', 'unknown']);

export const olts = pgTable('olts', {
    id: uuid('id').defaultRandom().primaryKey(),
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
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export type Olt = typeof olts.$inferSelect;
export type NewOlt = typeof olts.$inferInsert;
