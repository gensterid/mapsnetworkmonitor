/**
 * Circuit-breaker sederhana berbasis memori untuk melindungi integrasi eksternal
 * yang lambat/mati (mis. GenieACS `ECONNREFUSED`, MikroTik timeout 30 dtk). Saat
 * sebuah key gagal, ia "di-trip" selama cooldown (backoff eksponensial) sehingga
 * pemanggil bisa FAST-SKIP alih-alih menunggu timeout penuh tiap siklus.
 *
 * Catatan:
 * - State disimpan di memori per-proses. Worker BullMQ + scheduler + HTTP jalan
 *   di proses yang sama, jadi cukup. Tidak persist lintas-restart (memang tak perlu).
 * - Setelah cooldown habis, breaker jadi "half-open": 1 percobaan diizinkan. Bila
 *   gagal lagi → backoff makin panjang; bila sukses → reset.
 */
export interface BreakerOptions {
    /** Cooldown dasar (ms) untuk kegagalan pertama. Default 60 dtk. */
    baseMs?: number;
    /** Batas atas cooldown (ms). Default 5 menit. */
    maxMs?: number;
}

interface BreakerState {
    failUntil: number;
    consecutiveFailures: number;
}

export class CircuitBreaker {
    private readonly states = new Map<string, BreakerState>();
    private readonly baseMs: number;
    private readonly maxMs: number;

    constructor(opts: BreakerOptions = {}) {
        this.baseMs = opts.baseMs ?? 60_000;
        this.maxMs = opts.maxMs ?? 5 * 60_000;
    }

    /** true bila key masih dalam cooldown → pemanggil sebaiknya skip. */
    isTripped(key: string): boolean {
        const s = this.states.get(key);
        if (!s) return false;
        // Cooldown habis → half-open (izinkan 1 percobaan). Jangan hapus state
        // agar consecutiveFailures tetap terjaga bila percobaan itu gagal lagi.
        return s.failUntil > Date.now();
    }

    /** Sisa cooldown (ms) — untuk logging. */
    remainingMs(key: string): number {
        const s = this.states.get(key);
        return s ? Math.max(0, s.failUntil - Date.now()) : 0;
    }

    /** Catat sukses → reset breaker untuk key ini. */
    recordSuccess(key: string): void {
        this.states.delete(key);
    }

    /** Catat gagal → trip breaker dengan backoff eksponensial. Return cooldown (ms). */
    recordFailure(key: string): number {
        const prev = this.states.get(key);
        const consecutiveFailures = (prev?.consecutiveFailures ?? 0) + 1;
        const backoff = Math.min(this.maxMs, this.baseMs * 2 ** (consecutiveFailures - 1));
        this.states.set(key, { failUntil: Date.now() + backoff, consecutiveFailures });
        return backoff;
    }
}
