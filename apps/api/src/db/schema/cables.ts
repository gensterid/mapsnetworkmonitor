import {
    pgTable,
    uuid,
    text,
    jsonb,
    timestamp,
    index,
} from 'drizzle-orm/pg-core';
import { routers } from './routers.js';
import { tenants } from './tenants.js';

/**
 * Fiber Cables (Cara C) — objek kabel yang digambar bebas di peta, membawa
 * sekumpulan core (index warna TIA-598). Independen dari device-tree
 * (`connectedToId`); dirender sebagai garis belang N-core. Fully manual, fully
 * flexible: core bisa numpang/pisah/gabung/lanjut karena operator menggambar
 * tiap ruas kabel apa adanya. Lihat docs/FIBER-CABLE-DESIGN.md.
 */
export const fiberCables = pgTable('fiber_cables', {
    id: uuid('id').defaultRandom().primaryKey(),
    // Scope multi-tenant (WAJIB difilter di tiap query).
    tenantId: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),
    // Router pemilik area (opsional, untuk filter). Kabel tetap ada kalau
    // router dihapus → set null (bukan cascade).
    routerId: uuid('router_id').references(() => routers.id, { onDelete: 'set null' }),
    name: text('name'),
    // Rute kabel: [[lat,lng], …] (minimal 2 titik).
    path: jsonb('path').$type<[number, number][]>().notNull().default([]),
    // Core yang dibawa: array index 1-based (TIA-598), mis. [1,2] = biru+oranye.
    cores: jsonb('cores').$type<number[]>().notNull().default([]),
    // Penanda jarak (cek putus) sepanjang kabel: [{ side, meters, label }].
    // side = 'source'|'dest' (ujung mana), meters = jarak dari ujung itu.
    distanceMarkers: jsonb('distance_markers')
        .$type<{ side: string; meters: number; label?: string }[]>()
        .notNull().default([]),
    // Anchor opsional ke device (untuk snap ujung path ke marker).
    fromDeviceId: uuid('from_device_id'),
    toDeviceId: uuid('to_device_id'),
    notes: text('notes'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
    tenantIdIdx: index('fiber_cables_tenant_id_idx').on(table.tenantId),
    routerIdIdx: index('fiber_cables_router_id_idx').on(table.routerId),
}));
