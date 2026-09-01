// Helper MURNI untuk retensi metrik high-volume (hypertable TimescaleDB).
// Dipisah dari scheduler.ts agar bisa diuji tanpa memicu init env/DB/queue
// (import scheduler.ts merantai ke validasi env yang memanggil process.exit).
//
// Metrik high-volume disimpan di hypertable TimescaleDB dengan kompresi aktif.
// Retensi WAJIB lewat drop_chunks / retention policy Timescale — DELETE per-baris
// TIDAK didukung di chunk terkompresi (dulu bikin cleanup gagal tiap siklus &
// penyimpanan membengkak; lihat memori metrics-retention-timescale).

// Map: hypertable → setting key retensi (hari).
export const METRICS_HYPERTABLES = {
    router_metrics: 'metrics_retention_days',
    device_performance_history: 'performance_retention_days',
    router_interface_metrics: 'interface_metrics_retention_days',
} as const;

export const METRICS_RETENTION_DEFAULT_DAYS = 60;
// Batas atas waras (10 tahun). Mencegah nilai salah-ketik yang sangat besar
// (mis. 1e21) memicu notasi eksponensial di make_interval → query gagal → policy
// tak terpasang → penyimpanan membengkak lagi.
export const METRICS_RETENTION_MAX_DAYS = 3650;

/**
 * Retensi GLOBAL per hypertable = nilai PALING LONGGAR antar-tenant (chunk dibagi
 * lintas-tenant, jadi window terpendek akan menghapus data tenant lain lebih awal).
 * Di-clamp ke [1, METRICS_RETENTION_MAX_DAYS] dan dibulatkan ke integer
 * (make_interval butuh int). Nilai non-number/non-finite diabaikan.
 */
export function pickRetentionDays(tenantValues: number[], defaultDays: number = METRICS_RETENTION_DEFAULT_DAYS): number {
    let days = defaultDays;
    for (const v of tenantValues) {
        if (Number.isFinite(v) && v > days) days = v;
    }
    return Math.min(METRICS_RETENTION_MAX_DAYS, Math.max(1, Math.floor(days)));
}
