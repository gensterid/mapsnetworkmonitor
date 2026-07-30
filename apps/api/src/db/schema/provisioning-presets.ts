import {
    pgTable,
    uuid,
    text,
    integer,
    timestamp,
    pgEnum,
    index,
} from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';
import { olts, oltTypeEnum } from './olts.js';

/**
 * Preset provisioning ONU di OLT (Fase-1) — config awal SEBELUM ONU terbaca
 * di GenieACS. BEDA dari tabel `presets` (yang untuk WAN/WiFi ONT / Fase-2).
 *
 * Operator MEMILIH preset saat authorize ONU, bukan mengetik VLAN/profile
 * mentah — mempersempit blast-radius. Bentuknya mengikuti interface
 * `ProvisioningPreset` di services/olt-drivers/olt-provisioning.interface.ts.
 *
 * Field rahasia disimpan TERENKRIPSI (kolom *Encrypted) dan HARUS di-strip
 * saat dibaca lewat API — samakan dengan pola user-routers / olts.
 */

export const provisioningWanModeEnum = pgEnum('provisioning_wan_mode', [
    'bridge',
    'pppoe',
    'dhcp',
]);

export const provisioningPresets = pgTable('provisioning_presets', {
    id: uuid('id').defaultRandom().primaryKey(),
    // Tenant-scoped (audit isolasi tenant). Nullable = preset global/superadmin.
    tenantId: uuid('tenant_id').references(() => tenants.id),

    name: text('name').notNull(), // mis. "ZTE-Home-100M"
    description: text('description'),

    // Keberlakuan: preset khas per-vendor OLT (profil HSGQ != C-Data).
    // oltType null = berlaku umum; oltId opsional untuk mengunci ke satu OLT.
    oltType: oltTypeEnum('olt_type'),
    oltId: uuid('olt_id').references(() => olts.id),

    // Nama profil khas vendor (dipilih per model ONU: ZTE/Huawei/Fiberhome/GGCLink).
    onuTypeProfile: text('onu_type_profile'),
    lineProfile: text('line_profile'),
    serviceProfile: text('service_profile'),

    // VLAN
    serviceVlan: integer('service_vlan').notNull(), // VLAN data/internet
    mgmtVlan: integer('mgmt_vlan'), // VLAN manajemen (jalur TR-069)

    // ACS / TR-069 (linchpin Fase-1 -> Fase-2)
    acsUrl: text('acs_url'),
    acsUsername: text('acs_username'),
    acsPasswordEncrypted: text('acs_password_encrypted'), // RAHASIA — strip saat read
    informInterval: integer('inform_interval'), // detik

    // WAN
    wanMode: provisioningWanModeEnum('wan_mode').default('bridge').notNull(),
    pppoeUsername: text('pppoe_username'),
    pppoePasswordEncrypted: text('pppoe_password_encrypted'), // RAHASIA — strip saat read

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => ({
    tenantIdIdx: index('provisioning_presets_tenant_id_idx').on(table.tenantId),
    oltIdIdx: index('provisioning_presets_olt_id_idx').on(table.oltId),
}));

export type ProvisioningPresetRow = typeof provisioningPresets.$inferSelect;
export type NewProvisioningPresetRow = typeof provisioningPresets.$inferInsert;
