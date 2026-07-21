/**
 * Helper parsing kecepatan link MikroTik.
 *
 * Nilai `speed` pada routerInterfaces berasal dari `/interface/ethernet/monitor
 * once` (rate hasil negosiasi) dengan fallback ke `/interface/ethernet/print`,
 * jadi bentuknya bisa "1Gbps", "100Mbps", "10Mbps", kadang "2.5Gbps".
 */

/**
 * Ubah string kecepatan link menjadi Mbps.
 *
 * Mengembalikan `null` — BUKAN 0 — bila nilainya kosong/tak dikenal (mis.
 * port sedang down sehingga speed kosong, atau nilainya "auto"). Pemanggil
 * WAJIB memperlakukan null sebagai "tidak diketahui" dan melewati
 * perbandingan; menganggapnya 0 akan terlihat seperti penurunan drastis dan
 * memicu alert palsu.
 */
export function parseSpeedMbps(raw: unknown): number | null {
    if (raw == null) return null;
    const s = String(raw).trim();
    if (!s) return null;

    // Tanda minus ikut ditangkap supaya guard `value <= 0` di bawah benar-benar
    // aktif — tanpa itu "-1Gbps" akan terbaca sebagai 1000.
    const m = s.match(/(-?[\d.]+)\s*(T|G|M|K)?/i);
    if (!m) return null;

    const value = Number(m[1]);
    if (!Number.isFinite(value) || value <= 0) return null;

    // Tanpa satuan diasumsikan Mbps (MikroTik kadang mengembalikan angka polos).
    const unit = (m[2] || 'M').toUpperCase();
    const factor = unit === 'T' ? 1_000_000 : unit === 'G' ? 1_000 : unit === 'K' ? 0.001 : 1;
    return value * factor;
}

/** Format Mbps kembali ke label pendek untuk pesan alert ("1Gbps", "100Mbps"). */
export function formatSpeedMbps(mbps: number): string {
    if (mbps >= 1000) {
        const g = mbps / 1000;
        return `${Number.isInteger(g) ? g : g.toFixed(1)}Gbps`;
    }
    return `${Number.isInteger(mbps) ? mbps : mbps.toFixed(1)}Mbps`;
}
