// Threshold: ONU dianggap "hilang" kalau sumber tersebut tidak melihatnya
// selama > STALE_THRESHOLD_MS. Scheduler OLT polling = 15 menit, ACS = 10 menit.
// 2 jam memberi margin ~8 missed polls agar tidak false-positive dari outage sementara.
const STALE_THRESHOLD_MS = 2 * 60 * 60 * 1000;

/**
 * Evaluate per-source freshness of an ONU record.
 *
 * Returns one of:
 *   { kind: 'healthy' }                       — semua sumber yang relevan masih update
 *   { kind: 'missing-olt' }                   — discovery_sources include 'olt' tapi last_seen_olt basi/null
 *   { kind: 'missing-acs' }                   — discovery_sources include 'acs' tapi last_seen_acs basi/null
 *   { kind: 'ghost' }                         — keduanya basi
 *   { kind: 'na' }                            — ONU belum pernah di-sync oleh sumber apapun
 */
export function computeOnuSourceHealth(onu) {
    const sources = Array.isArray(onu?.discoverySources) ? onu.discoverySources : [];
    const now = Date.now();
    const oltTs = onu?.lastSeenOlt ? new Date(onu.lastSeenOlt).getTime() : 0;
    const acsTs = onu?.lastSeenAcs ? new Date(onu.lastSeenAcs).getTime() : 0;

    const oltRelevant = sources.includes('olt');
    const acsRelevant = sources.includes('acs');

    if (!oltRelevant && !acsRelevant) return { kind: 'na' };

    const oltStale = oltRelevant && (oltTs === 0 || now - oltTs > STALE_THRESHOLD_MS);
    const acsStale = acsRelevant && (acsTs === 0 || now - acsTs > STALE_THRESHOLD_MS);

    if (oltStale && acsStale) return { kind: 'ghost' };
    if (oltStale) return { kind: 'missing-olt' };
    if (acsStale) return { kind: 'missing-acs' };
    return { kind: 'healthy' };
}

export function getSourceHealthLabel(kind) {
    switch (kind) {
        case 'missing-olt': return 'Hilang di OLT';
        case 'missing-acs': return 'Hilang di ACS';
        case 'ghost': return 'Ghost ONU';
        case 'healthy': return 'OLT + ACS';
        case 'na': return '';
        default: return '';
    }
}

export function getSourceHealthClasses(kind) {
    switch (kind) {
        case 'missing-olt':
            return 'bg-red-500/10 text-red-400 border border-red-500/30';
        case 'missing-acs':
            return 'bg-amber-500/10 text-amber-400 border border-amber-500/30';
        case 'ghost':
            return 'bg-rose-600/15 text-rose-400 border border-rose-500/40 animate-pulse';
        case 'healthy':
            return 'bg-emerald-500/5 text-emerald-500/70 border border-emerald-500/10';
        case 'na':
        default:
            return 'hidden';
    }
}
