import {
    pgTable,
    uuid,
    text,
    timestamp,
    jsonb,
    pgEnum,
} from 'drizzle-orm/pg-core';
import { onus } from './onus.js';

export const backupTypeEnum = pgEnum('genieacs_backup_type', [
    'snapshot',
    'template',
]);

export const genieacsBackups = pgTable('genieacs_backups', {
    id: uuid('id').defaultRandom().primaryKey(),
    onuId: uuid('onu_id').references(() => onus.id, { onDelete: 'cascade' }),
    sn: text('sn').notNull(),
    vendor: text('vendor').notNull(),
    model: text('model').notNull(),
    name: text('name').notNull(),
    type: backupTypeEnum('type').default('snapshot').notNull(),
    config: jsonb('config').notNull(), // Stores the scrubbed TR-069 parameters
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export type GenieACSBackup = typeof genieacsBackups.$inferSelect;
export type NewGenieACSBackup = typeof genieacsBackups.$inferInsert;
