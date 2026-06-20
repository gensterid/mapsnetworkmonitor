/**
 * Feature registry — single source of truth untuk fitur yang BISA di-toggle
 * superadmin. Key HARUS identik dengan backend
 * (apps/api/src/services/system-settings.service.ts TOGGLEABLE_FEATURES).
 *
 * Saat superadmin matikan fitur → hilang untuk admin/operator/user.
 * Superadmin selalu lihat semua (bypass).
 *
 * Fitur CORE (Map, Router, Alert, Dashboard, Settings) + admin-only
 * (Users, Tenants, Audit Log, VPN Servers) TIDAK ada di sini — selalu aktif.
 *
 * Field:
 *   key         — id flag (match backend)
 *   label       — nama tampil di UI toggle
 *   description — penjelasan singkat untuk superadmin
 *   paths       — route prefix yang di-gate (untuk nav + route guard)
 *   group       — kategori untuk grouping di settings UI
 */
export const FEATURE_REGISTRY = [
    {
        key: 'billing',
        label: 'Billing',
        description: 'Manajemen pelanggan, tagihan, paket, payment gateway, isolir otomatis.',
        paths: ['/billing'],
        group: 'Bisnis',
    },
    {
        key: 'mikhmon',
        label: 'MikHMON Console',
        description: 'Console hotspot lengkap: user, voucher, IP binding, walled garden, queue.',
        paths: ['/mikhmon'],
        group: 'Bisnis',
    },
    {
        key: 'voucherOnline',
        label: 'Voucher Online (Publik)',
        description: 'Halaman pembelian voucher publik (/beli) + payment gateway untuk pembeli casual.',
        paths: ['/beli'],
        group: 'Bisnis',
    },
    {
        key: 'analytics',
        label: 'Analytics',
        description: 'Dashboard analitik tren jaringan dan performa.',
        paths: ['/analytics'],
        group: 'Monitoring',
    },
    {
        key: 'genieacs',
        label: 'GenieACS (TR-069)',
        description: 'Inventory ONU, WiFi config, backup/restore, reboot remote via TR-069.',
        paths: ['/genieacs'],
        group: 'Monitoring',
    },
    {
        key: 'olt',
        label: 'OLT Management',
        description: 'Monitoring & manajemen OLT (SNMP/web) dan ONU.',
        paths: ['/olts'],
        group: 'Monitoring',
    },
    {
        key: 'issues',
        label: 'System Issues',
        description: 'Halaman ringkasan isu sistem (CPU/memory/threshold).',
        paths: ['/issues'],
        group: 'Monitoring',
    },
    {
        key: 'serviceHealth',
        label: 'Service Health',
        description: 'Halaman kesehatan layanan Netwatch terpusat.',
        paths: ['/netwatch'],
        group: 'Monitoring',
    },
    {
        key: 'notifications',
        label: 'Notification Groups',
        description: 'Grup notifikasi & channel alert (WA, webhook, dll).',
        paths: ['/notification-groups'],
        group: 'Administrasi',
    },
    {
        key: 'aiDiagnosis',
        label: 'AI Diagnosis',
        description: 'Ringkasan & diagnosa jaringan berbasis AI (butuh GEMINI_API_KEY).',
        paths: [],
        group: 'Lainnya',
    },
];

/** Set semua key yang valid (untuk validation cepat). */
export const FEATURE_KEYS = FEATURE_REGISTRY.map((f) => f.key);

/** Default flags map — semua aktif. Dipakai sebagai fallback saat loading. */
export const DEFAULT_FEATURE_FLAGS = FEATURE_KEYS.reduce((acc, key) => {
    acc[key] = true;
    return acc;
}, {});

/**
 * Cek apakah sebuah fitur aktif untuk user saat ini.
 * Superadmin SELALU true (bypass) supaya bisa manage/re-enable.
 *
 * @param {string} key        feature key
 * @param {object} flags      flags map dari useFeatureFlags()
 * @param {boolean} isSuperAdmin
 * @returns {boolean}
 */
export function isFeatureEnabled(key, flags, isSuperAdmin) {
    if (isSuperAdmin) return true;
    // Fitur tidak terdaftar = core/always-on
    if (!FEATURE_KEYS.includes(key)) return true;
    // Default true kalau flags belum ke-load
    return flags?.[key] !== false;
}

/**
 * Cek apakah sebuah path di-gate oleh fitur yang dimatikan.
 * Return null kalau path tidak ter-gate atau fiturnya aktif.
 * Return feature key kalau path di-block (untuk redirect/hide).
 *
 * @param {string} pathname   route pathname (mis. '/billing/invoices')
 * @param {object} flags
 * @param {boolean} isSuperAdmin
 * @returns {string|null} blocked feature key, atau null kalau boleh akses
 */
export function getBlockedFeatureForPath(pathname, flags, isSuperAdmin) {
    if (isSuperAdmin) return null;
    for (const feature of FEATURE_REGISTRY) {
        for (const prefix of feature.paths) {
            if (pathname === prefix || pathname.startsWith(prefix + '/')) {
                if (flags?.[feature.key] === false) return feature.key;
            }
        }
    }
    return null;
}
