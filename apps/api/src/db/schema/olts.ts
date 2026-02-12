import {
    pgTable,
    uuid,
    text,
    integer,
    timestamp,
    pgEnum,
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
    uptime: integer('uptime'), // in seconds
    description: text('description'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export type Olt = typeof olts.$inferSelect;
export type NewOlt = typeof olts.$inferInsert;
