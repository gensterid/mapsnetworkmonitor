/**
 * MikHMON Console schema.
 *
 * Phase A10.1 — per (router, profile) metadata that MikHMON external
 * stores in browser localStorage (price, validity, lock-user setting).
 * Lives in DB here so the Reports tab can aggregate sales across
 * sessions and machines, and so the Script Wizard can record which
 * profiles have been MikHMON-managed.
 */
import {
    pgTable,
    uuid,
    text,
    timestamp,
    integer,
    boolean,
    numeric,
    index,
    uniqueIndex,
} from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';
import { routers } from './routers.js';

export const mikhmonProfileSettings = pgTable('mikhmon_profile_settings', {
    id: uuid('id').defaultRandom().primaryKey(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'cascade' }),
    routerId: uuid('router_id').notNull().references(() => routers.id, { onDelete: 'cascade' }),
    profileName: text('profile_name').notNull(),

    /** Operator cost in Rupiah (what operator pays to get the voucher). */
    price: numeric('price', { precision: 14, scale: 2 }).notNull().default('0'),
    /** Selling price in Rupiah (what voucher is sold for — used by Reports income). */
    sellingPrice: numeric('selling_price', { precision: 14, scale: 2 }).notNull().default('0'),

    /** RouterOS time string baked into the on-login script (e.g. "1d", "12h"). */
    validity: text('validity'),

    /**
     * RouterOS `limit-uptime` baked into each generated voucher. Different
     * from `validity` — limit-uptime counts cumulative connected time,
     * validity counts wall clock from first login. Operators often
     * combine both (e.g. "1d validity / 10h uptime" — expires whichever
     * comes first).
     */
    limitUptime: text('limit_uptime'),

    /**
     * MikHMON v3 "Expired Mode" — what to do when voucher validity ends.
     *   Remove          — delete user + scheduler (default, most common)
     *   Notice          — just log a notice, keep user
     *   Notice & Remove — log notice THEN remove
     */
    expiredMode: text('expired_mode').notNull().default('Remove'),

    /** When true, the wizard's on-login script binds the user to their MAC after first login. */
    lockUser: boolean('lock_user').notNull().default(false),
    sharedUsers: integer('shared_users').notNull().default(1),

    /** Flipped to true when the Wizard installs/refreshes the auto-expire scripts. */
    scriptsInstalled: boolean('scripts_installed').notNull().default(false),
    scriptsInstalledAt: timestamp('scripts_installed_at'),

    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (t) => ({
    tenantIdx: index('mikhmon_ps_tenant_idx').on(t.tenantId),
    routerIdx: index('mikhmon_ps_router_idx').on(t.routerId),
    uniqRouterProfile: uniqueIndex('mikhmon_ps_router_profile_unq').on(t.routerId, t.profileName),
}));

export type MikhmonProfileSetting = typeof mikhmonProfileSettings.$inferSelect;
export type NewMikhmonProfileSetting = typeof mikhmonProfileSettings.$inferInsert;
