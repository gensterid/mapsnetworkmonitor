import { db } from '../db/index.js';
import {
    provisioningPresets,
    ProvisioningPresetRow,
    NewProvisioningPresetRow,
} from '../db/schema/provisioning-presets.js';
import { eq, and, desc } from 'drizzle-orm';
import { encrypt } from '../lib/encryption.js';
import { olts } from '../db/schema/olts.js';

/**
 * Input dari API — secret (acsPassword/pppoePassword) sebagai PLAINTEXT.
 * Service yang meng-enkripsi ke kolom *Encrypted.
 */
export interface ProvisioningPresetInput {
    name: string;
    description?: string;
    oltType?: 'hsgq' | 'cdata' | 'generic';
    oltId?: string;
    onuTypeProfile?: string;
    lineProfile?: string;
    serviceProfile?: string;
    serviceVlan: number;
    mgmtVlan?: number;
    acsUrl?: string;
    acsUsername?: string;
    acsPassword?: string; // plaintext -> acsPasswordEncrypted
    informInterval?: number;
    wanMode?: 'bridge' | 'pppoe' | 'dhcp';
    pppoeUsername?: string;
    pppoePassword?: string; // plaintext -> pppoePasswordEncrypted
}

/**
 * Bentuk yang dikembalikan ke client — TANPA ciphertext secret; hanya flag
 * apakah secret terisi.
 */
export type ProvisioningPresetPublic = Omit<
    ProvisioningPresetRow,
    'acsPasswordEncrypted' | 'pppoePasswordEncrypted'
> & {
    hasAcsPassword: boolean;
    hasPppoePassword: boolean;
};

function redact(row: ProvisioningPresetRow): ProvisioningPresetPublic {
    const { acsPasswordEncrypted, pppoePasswordEncrypted, ...rest } = row;
    return {
        ...rest,
        hasAcsPassword: !!acsPasswordEncrypted,
        hasPppoePassword: !!pppoePasswordEncrypted,
    };
}

/** Petakan input API -> kolom row, enkripsi secret. Hanya field yang disuplai. */
function toRow(input: Partial<ProvisioningPresetInput>): Partial<NewProvisioningPresetRow> {
    const row: Partial<NewProvisioningPresetRow> = {};
    if (input.name !== undefined) row.name = input.name;
    if (input.description !== undefined) row.description = input.description;
    if (input.oltType !== undefined) row.oltType = input.oltType;
    if (input.oltId !== undefined) row.oltId = input.oltId;
    if (input.onuTypeProfile !== undefined) row.onuTypeProfile = input.onuTypeProfile;
    if (input.lineProfile !== undefined) row.lineProfile = input.lineProfile;
    if (input.serviceProfile !== undefined) row.serviceProfile = input.serviceProfile;
    if (input.serviceVlan !== undefined) row.serviceVlan = input.serviceVlan;
    if (input.mgmtVlan !== undefined) row.mgmtVlan = input.mgmtVlan;
    if (input.acsUrl !== undefined) row.acsUrl = input.acsUrl;
    if (input.acsUsername !== undefined) row.acsUsername = input.acsUsername;
    if (input.acsPassword !== undefined) {
        row.acsPasswordEncrypted = input.acsPassword ? encrypt(input.acsPassword) : null;
    }
    if (input.informInterval !== undefined) row.informInterval = input.informInterval;
    if (input.wanMode !== undefined) row.wanMode = input.wanMode;
    if (input.pppoeUsername !== undefined) row.pppoeUsername = input.pppoeUsername;
    if (input.pppoePassword !== undefined) {
        row.pppoePasswordEncrypted = input.pppoePassword ? encrypt(input.pppoePassword) : null;
    }
    return row;
}

/**
 * Semua operasi di-scope tenant (pola audit `and(eq(id), tenantId? eq)`).
 * Route WAJIB memasang `requireTenantContext` agar akun orphan tak lolos.
 */
export const provisioningPresetService = {
    /** True bila oltId milik tenant (atau superadmin). Cegah IDOR referensi lintas-tenant. */
    isOltOwned: async (oltId: string, tenantId?: string | null): Promise<boolean> => {
        const [olt] = await db
            .select({ id: olts.id })
            .from(olts)
            .where(and(eq(olts.id, oltId), tenantId ? eq(olts.tenantId, tenantId) : undefined));
        return !!olt;
    },

    create: async (input: ProvisioningPresetInput, tenantId?: string | null): Promise<ProvisioningPresetPublic> => {
        const row = toRow(input) as NewProvisioningPresetRow;
        row.tenantId = tenantId ?? null; // dipaksa dari konteks, bukan body
        const [created] = await db.insert(provisioningPresets).values(row).returning();
        return redact(created);
    },

    findAll: async (tenantId?: string | null): Promise<ProvisioningPresetPublic[]> => {
        const rows = await db
            .select()
            .from(provisioningPresets)
            .where(tenantId ? eq(provisioningPresets.tenantId, tenantId) : undefined)
            .orderBy(desc(provisioningPresets.createdAt));
        return rows.map(redact);
    },

    findById: async (id: string, tenantId?: string | null): Promise<ProvisioningPresetPublic | undefined> => {
        const [row] = await db
            .select()
            .from(provisioningPresets)
            .where(and(eq(provisioningPresets.id, id), tenantId ? eq(provisioningPresets.tenantId, tenantId) : undefined));
        return row ? redact(row) : undefined;
    },

    update: async (
        id: string,
        input: Partial<ProvisioningPresetInput>,
        tenantId?: string | null,
    ): Promise<ProvisioningPresetPublic | undefined> => {
        const [updated] = await db
            .update(provisioningPresets)
            .set({ ...toRow(input), updatedAt: new Date() })
            .where(and(eq(provisioningPresets.id, id), tenantId ? eq(provisioningPresets.tenantId, tenantId) : undefined))
            .returning();
        return updated ? redact(updated) : undefined;
    },

    delete: async (id: string, tenantId?: string | null): Promise<ProvisioningPresetPublic | undefined> => {
        const [deleted] = await db
            .delete(provisioningPresets)
            .where(and(eq(provisioningPresets.id, id), tenantId ? eq(provisioningPresets.tenantId, tenantId) : undefined))
            .returning();
        return deleted ? redact(deleted) : undefined;
    },
};
