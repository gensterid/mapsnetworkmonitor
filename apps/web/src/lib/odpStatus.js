/**
 * Derive ODP health from attached ONUs.
 *
 * Rationale: ODP tidak punya IP/ping sendiri, tapi saat fiber ke ODP putus
 * maka semua ONU yang bergantung padanya akan down dengan tanda optical loss.
 * Kalau ≥2 ONU menempel dan semuanya optical-down, ODP dianggap down (merah).
 * Kalau sebagian saja → warning (kuning). Default tidak menyentuh status ODP.
 */

const OPTICAL_LOSS_STATUSES = new Set(['lost', 'power_down', 'dying_gasp']);
const LOW_SIGNAL_DBM = -28;

export function isOnuOpticalDown(onu) {
    if (!onu) return false;
    const status = String(onu.status || '').toLowerCase();
    if (OPTICAL_LOSS_STATUSES.has(status)) return true;
    if (status === 'offline' || status === 'down') {
        const rxRaw = onu.lastRxPower ?? onu.last_rx_power ?? onu.signal;
        const rx = parseFloat(rxRaw);
        if (Number.isFinite(rx) && rx < LOW_SIGNAL_DBM) return true;
    }
    return false;
}

/**
 * Returns:
 *   'down'    — ≥2 ONU menempel dan SEMUA optical-down
 *   'warning' — sebagian ONU optical-down (≥1 tapi tidak semua)
 *   null      — tidak ada cukup sinyal untuk override, biarkan status existing
 */
export function computeOdpDerivedStatus(attachedOnus) {
    if (!Array.isArray(attachedOnus) || attachedOnus.length === 0) return null;
    const total = attachedOnus.length;
    const downCount = attachedOnus.filter(isOnuOpticalDown).length;
    if (total >= 2 && downCount === total) return 'down';
    if (downCount > 0) return 'warning';
    return null;
}
