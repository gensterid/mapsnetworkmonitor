import { pgTable, uuid, timestamp, primaryKey } from 'drizzle-orm/pg-core';
import { users } from './users';
import { routers } from './routers';

// User Routers junction table (for access control)
export const userRouters = pgTable(
    'user_routers',
    {
        userId: uuid('user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        routerId: uuid('router_id')
            .notNull()
            .references(() => routers.id, { onDelete: 'cascade' }),
        createdAt: timestamp('created_at').defaultNow().notNull(),
    },
    (t) => ({
        pk: primaryKey(t.userId, t.routerId),
    })
);

// Types
export type UserRouter = typeof userRouters.$inferSelect;
export type NewUserRouter = typeof userRouters.$inferInsert;
