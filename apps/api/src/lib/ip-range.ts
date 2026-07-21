/**
 * Helper rentang IPv4 untuk menghitung kapasitas & okupansi IP pool MikroTik.
 *
 * Field `ranges` pada `/ip/pool` berupa string: satu IP tunggal
 * ("10.0.0.5"), satu rentang ("10.0.0.10-10.0.0.250"), atau beberapa
 * rentang dipisah koma.
 */

export interface Ipv4Range {
    start: number;
    end: number;
}

/** IPv4 dotted-quad → integer. null bila bukan IPv4 valid (mis. alamat IPv6). */
export function ipv4ToInt(ip: string): number | null {
    const parts = String(ip).trim().split('.');
    if (parts.length !== 4) return null;

    let out = 0;
    for (const part of parts) {
        if (!/^\d{1,3}$/.test(part)) return null;
        const n = Number(part);
        if (n > 255) return null;
        out = out * 256 + n;
    }
    return out;
}

/**
 * Urai string `ranges` menjadi daftar rentang.
 *
 * Bagian yang tak bisa diurai (mis. rentang IPv6) DILEWATI, bukan dianggap
 * kosong — pemanggil memutuskan lewat jumlah hasil. Ini penting agar pool
 * IPv6 tidak salah dilaporkan sebagai "kapasitas 0 / penuh".
 */
export function parseIpv4Ranges(ranges: string | undefined | null): Ipv4Range[] {
    if (!ranges) return [];

    const out: Ipv4Range[] = [];
    for (const chunk of String(ranges).split(',')) {
        const part = chunk.trim();
        if (!part) continue;

        const [rawStart, rawEnd] = part.split('-');
        const start = ipv4ToInt(rawStart ?? '');
        if (start === null) continue;

        // Tanpa tanda "-" berarti pool satu alamat.
        const end = rawEnd === undefined ? start : ipv4ToInt(rawEnd);
        if (end === null || end < start) continue;

        out.push({ start, end });
    }
    return out;
}

/** Total alamat yang dapat dialokasikan pada seluruh rentang. */
export function countAddresses(ranges: Ipv4Range[]): number {
    return ranges.reduce((sum, r) => sum + (r.end - r.start + 1), 0);
}

/** Apakah sebuah IP berada di dalam salah satu rentang. */
export function isIpInRanges(ip: string | undefined | null, ranges: Ipv4Range[]): boolean {
    if (!ip) return false;
    const n = ipv4ToInt(ip);
    if (n === null) return false;
    return ranges.some((r) => n >= r.start && n <= r.end);
}
