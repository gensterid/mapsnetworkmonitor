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

/**
 * Retensi GLOBAL per hypertable = nilai PALING LONGGAR antar-tenant (chunk dibagi
 * lintas-tenant, jadi window terpendek akan menghapus data tenant lain lebih awal).
 * Selalu ≥ default dan ≥ 1 hari, dibulatkan ke integer (make_interval butuh int).
 */
export function pickRetentionDays(tenantValues: number[], defaultDays: number = METRICS_RETENTION_DEFAULT_DAYS): number {
    let days = defaultDays;
    for (const v of tenantValues) {
        if (Number.isFinite(v) && v > days) days = v;
    }
    return Math.max(1, Math.floor(days));
}
