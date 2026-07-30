import { db } from '../db/index.js';
import { olts } from '../db/schema/olts.js';
import { eq, and } from 'drizzle-orm';
import { decrypt } from '../lib/encryption.js';
import { OltDriverFactory } from './olt-drivers/driver.factory.js';
import { UnconfiguredOnu } from './olt-drivers/olt-provisioning.interface.js';

// Port Telnet default OLT. TODO: bila unit pakai port/kredensial telnet berbeda
// dari web, tambah kolom khusus (telnet_port/telnet_username/telnet_password).
const TELNET_DEFAULT_PORT = 23;

/**
 * Resolve OLT (di-scope tenant) lalu bangun driver provisioning dari
 * kredensialnya. Mirror pola olt.service: decrypt webPassword sebelum dipakai.
 * Kredensial telnet SEMENTARA memakai ulang kredensial web.
 */
async function buildProvisioningDriver(oltId: string, tenantId?: string | null) {
    const [olt] = await db
        .select()
        .from(olts)
        .where(and(eq(olts.id, oltId), tenantId ? eq(olts.tenantId, tenantId) : undefined));
    if (!olt) {
        throw new Error('OLT tidak ditemukan atau bukan milik tenant ini');
    }

    const password = olt.webPassword ? decrypt(olt.webPassword) : undefined;

    return OltDriverFactory.getProvisioningDriver(olt.type, {
        host: olt.host,
        port: TELNET_DEFAULT_PORT,
        protocol: 'telnet',
        username: olt.webUsername ?? undefined,
        password,
    });
}

export const provisioningService = {
    /**
     * FASE-1 baca (READ-ONLY): daftar ONU yang belum ter-authorize di OLT.
     * Melempar bila merk OLT belum punya driver provisioning (mis. HSGQ → HAR).
     */
    getUnconfiguredOnus: async (oltId: string, tenantId?: string | null): Promise<UnconfiguredOnu[]> => {
        const driver = await buildProvisioningDriver(oltId, tenantId);
        return driver.getUnconfiguredOnus();
    },

    /** Uji koneksi transport provisioning (telnet) ke OLT. */
    testConnection: async (oltId: string, tenantId?: string | null): Promise<{ success: boolean; error?: string }> => {
        const driver = await buildProvisioningDriver(oltId, tenantId);
        return driver.testConnection();
    },
};
