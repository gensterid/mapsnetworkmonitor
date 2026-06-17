/**
 * Status Color & Label Constants — Single Source of Truth
 *
 * Semua komponen yang menampilkan status (badge, marker, dot, line, panel)
 * WAJIB import dari sini. Jangan hardcode warna `bg-green-500`, `text-red-400`,
 * dll. di file komponen.
 *
 * Token CSS terdefinisi di `src/index.css` blok `@theme`:
 *   --color-status-online   #22c55e  green-500
 *   --color-status-offline  #ef4444  red-500
 *   --color-status-issue    #eab308  yellow-500
 *   --color-status-unknown  #6b7280  gray-500
 *
 * Tailwind utility classes yang tersedia:
 *   bg-status-online, text-status-online, border-status-online, ring-status-online
 *   bg-status-offline, ...
 *   bg-status-issue, ...
 *   bg-status-unknown, ...
 *
 * Reference: docs/REFACTORING-PLAN.md Part B.1
 */

/**
 * 4 canonical status values di seluruh app.
 * Mapping ke string status spesifik (mis. PPPoE 'active' → 'online') dilakukan
 * via `mapToStatus()` di bawah.
 */
export const STATUS = Object.freeze({
    ONLINE: 'online',
    OFFLINE: 'offline',
    ISSUE: 'issue',
    UNKNOWN: 'unknown',
});

/**
 * Tailwind class bundle per status — siap pakai di className.
 * Pattern: tinted bg + saturated text + ring halus (Dark Luxury Badge pattern).
 */
export const STATUS_CLASSES = Object.freeze({
    online: {
        bg: 'bg-status-online/15',
        text: 'text-status-online',
        ring: 'ring-1 ring-status-online/30',
        dot: 'bg-status-online',
        border: 'border-status-online/40',
        // Map marker fill (raw hex, butuh karena Leaflet bukan Tailwind context)
        hex: '#22c55e',
    },
    offline: {
        bg: 'bg-status-offline/15',
        text: 'text-status-offline',
        ring: 'ring-1 ring-status-offline/30',
        dot: 'bg-status-offline',
        border: 'border-status-offline/40',
        hex: '#ef4444',
    },
    issue: {
        bg: 'bg-status-issue/15',
        text: 'text-status-issue',
        ring: 'ring-1 ring-status-issue/30',
        dot: 'bg-status-issue',
        border: 'border-status-issue/40',
        hex: '#eab308',
    },
    unknown: {
        bg: 'bg-status-unknown/15',
        text: 'text-status-unknown',
        ring: 'ring-1 ring-status-unknown/30',
        dot: 'bg-status-unknown',
        border: 'border-status-unknown/40',
        hex: '#6b7280',
    },
});

/**
 * Label localized (Bahasa Indonesia) untuk display di badge / tooltip.
 */
export const STATUS_LABELS = Object.freeze({
    online: 'Online',
    offline: 'Offline',
    issue: 'Bermasalah',
    unknown: 'Tidak Diketahui',
});

/**
 * Mapping status string dari berbagai domain ke 4 canonical status.
 *
 * Domains:
 *   - Router: 'online' / 'offline'
 *   - PPPoE: 'active' (= online), 'isolir' (= issue), 'expired' (= offline), 'cancelled' (= offline)
 *   - Netwatch: 'up' (= online), 'down' (= offline)
 *   - Invoice: 'paid' (= online), 'unpaid' (= issue), 'overdue' (= offline), 'cancelled' (= unknown)
 *   - Voucher: 'unused' (= unknown), 'active' (= online), 'expired' (= offline), 'cancelled' (= offline)
 *
 * Fallback: 'unknown' kalau tidak dikenali.
 */
export function mapToStatus(rawStatus) {
    if (!rawStatus) return STATUS.UNKNOWN;
    const s = String(rawStatus).toLowerCase().trim();

    // ONLINE family
    if (['online', 'up', 'active', 'paid', 'connected', 'running', 'success'].includes(s)) {
        return STATUS.ONLINE;
    }

    // OFFLINE family
    if (['offline', 'down', 'overdue', 'expired', 'cancelled', 'failed', 'error', 'disconnected', 'stopped'].includes(s)) {
        return STATUS.OFFLINE;
    }

    // ISSUE family (warning, attention needed)
    if (['issue', 'warning', 'unpaid', 'isolir', 'pending', 'degraded', 'slow', 'flapping'].includes(s)) {
        return STATUS.ISSUE;
    }

    return STATUS.UNKNOWN;
}

/**
 * Convenience getter — return class bundle untuk status raw apapun.
 * Pakai di komponen:
 *   const c = getStatusClasses(router.status);
 *   <span className={`${c.bg} ${c.text} ${c.ring}`}>{STATUS_LABELS[mapToStatus(router.status)]}</span>
 */
export function getStatusClasses(rawStatus) {
    return STATUS_CLASSES[mapToStatus(rawStatus)];
}

/**
 * Severity → status mapping untuk Alert system.
 *   critical → offline (red)
 *   high     → issue   (yellow)  ← deviation: high = warning, bukan critical
 *   medium   → issue
 *   low      → unknown
 *   info     → online  (info-only, hijau)
 */
export function severityToStatus(severity) {
    if (!severity) return STATUS.UNKNOWN;
    const s = String(severity).toLowerCase().trim();
    if (s === 'critical') return STATUS.OFFLINE;
    if (s === 'high' || s === 'medium' || s === 'warning') return STATUS.ISSUE;
    if (s === 'low') return STATUS.UNKNOWN;
    if (s === 'info') return STATUS.ONLINE;
    return STATUS.UNKNOWN;
}
