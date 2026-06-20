import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { systemSettings } from '../db/schema/system-settings.js';
import { logger } from '../lib/logger.js';

/**
 * SystemSettingsService \xe2\x80\x94 global (non-tenant) config controlled by superadmin.
 *
 * Feature flags: superadmin matikan fitur opsional \xe2\x86\x92 hilang untuk
 * admin/operator/user di semua tenant. Superadmin tetap lihat semua.
 */

const FEATURE_FLAGS_KEY = 'feature_flags';

/**
 * Canonical registry fitur yang BISA di-toggle. Key harus identik dengan
 * frontend (apps/web/src/constants/features.js). Default semua `true`
 * (fitur aktif out-of-box; superadmin matikan yang tidak dipakai).
 *
 * Fitur core (Map, Router, Alert, Dashboard, Settings, dan admin-only seperti
 * Users/Tenants/Audit/VPN) TIDAK ada di sini \xe2\x80\x94 selalu aktif.
 */
export const TOGGLEABLE_FEATURES = [
    'analytics',
    'billing',
    'mikhmon',
    'genieacs',
    'olt',
    'issues',
    'serviceHealth',
    'notifications',
    'aiDiagnosis',
    'voucherOnline',
] as const;

export type FeatureKey = (typeof TOGGLEABLE_FEATURES)[number];
export type FeatureFlags = Record<FeatureKey, boolean>;

function defaultFlags(): FeatureFlags {
    return TOGGLEABLE_FEATURES.reduce((acc, key) => {
        acc[key] = true;
        return acc;
    }, {} as FeatureFlags);
}

/**
 * Normalize stored value: merge dengan default + buang key asing.
 * Mencegah drift kalau registry berubah (fitur baru ditambah \xe2\x86\x92 default on,
 * fitur lama dihapus \xe2\x86\x92 diabaikan).
 */
function normalizeFlags(stored: unknown): FeatureFlags {
    const base = defaultFlags();
    if (stored && typeof stored === 'object') {
        for (const key of TOGGLEABLE_FEATURES) {
            const v = (stored as Record<string, unknown>)[key];
            if (typeof v === 'boolean') base[key] = v;
        }
    }
    return base;
}

export const systemSettingsService = {
    /**
     * Baca feature flags (selalu return full map dengan default terisi).
     * Dipakai semua role untuk tahu fitur apa yang aktif.
     */
    async getFeatureFlags(): Promise<FeatureFlags> {
        try {
            const [row] = await db
                .select()
                .from(systemSettings)
                .where(eq(systemSettings.key, FEATURE_FLAGS_KEY))
                .limit(1);
            return normalizeFlags(row?.value);
        } catch (err) {
            logger.error({ err: (err as Error).message }, 'getFeatureFlags failed; returning defaults');
            return defaultFlags();
        }
    },

    /**
     * Update feature flags (superadmin only \xe2\x80\x94 enforced di route).
     * Partial update: hanya key yang dikirim yang diubah, sisanya tetap.
     */
    async setFeatureFlags(partial: Partial<FeatureFlags>, updatedBy?: string): Promise<FeatureFlags> {
        const current = await this.getFeatureFlags();
        const next = normalizeFlags({ ...current, ...partial });

        await db
            .insert(systemSettings)
            .values({ key: FEATURE_FLAGS_KEY, value: next, updatedBy: updatedBy ?? null })
            .onConflictDoUpdate({
                target: systemSettings.key,
                set: { value: next, updatedBy: updatedBy ?? null, updatedAt: new Date() },
            });

        logger.info({ updatedBy, changed: Object.keys(partial) }, 'Feature flags updated');
        return next;
    },
};
