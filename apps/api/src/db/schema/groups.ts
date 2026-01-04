import { pgTable, uuid, text, timestamp } from 'drizzle-orm/pg-core';

// Router groups table
export const routerGroups = pgTable('router_groups', {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull(),
    description: text('description'),
    color: text('color').default('#3b82f6'), // Hex color for map markers
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Types
export type RouterGroup = typeof routerGroups.$inferSelect;
export type NewRouterGroup = typeof routerGroups.$inferInsert;
