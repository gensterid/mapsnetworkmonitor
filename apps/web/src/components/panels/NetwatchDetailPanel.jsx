import React, { useMemo } from 'react';
import clsx from 'clsx';
import {
    Wifi,
    Activity,
    Clock,
    AlertTriangle,
    Edit,
    Router as RouterIcon,
    Radio,
    Signal,
    Cable,
    ExternalLink,
    Users,
    Laptop,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import SidePanel from './SidePanel';
import MetricCard from './MetricCard';
import { mapToStatus, STATUS_CLASSES, STATUS_LABELS } from '@/constants/status';
import { useAppTimezone, useGenieACSDevices } from '@/hooks';
import { formatShortDateTime } from '@/lib/timezone';

/**
 * NetwatchDetailPanel — Quick view netwatch host saat klik marker.
 *
 * Brief user (Step 4 + iteration):
 *   - Panel detail netwatch host: IP, status, latency, packet loss, last seen
 *   - Plus OLT info kalau device linked ke ONU (sn, RX signal, PON port)
 *   - Plus shortcut ke tab ACS (DeviceModal) kalau ada SN + router parent
 *
 * Data flow (presentational only — semua data dari prop netwatch):
 *   - netwatch enriched dari backend dengan JOIN ONU + GenieACS:
 *     id, host, name, status, latency, packetLoss, lastSeen,
 *     routerId, routerName, deviceType,
 *     sn, oltId, linkedOnuId, lastRxPower, ponPort, oltName, onuIndex
 *   - Tidak fetch ACS data sendiri (TR-069 complex schema) — gunakan
 *     onEditFull(netwatch, 'acs') untuk buka DeviceModal tab ACS langsung
 *
 * Props:
 *   isOpen: boolean
 *   onClose: () => void
 *   netwatch: object | null
 *   onEditFull: (netwatch, initialTab?: 'settings'|'olt'|'acs'|'history') => void
 */

function latencyAccent(latencyMs) {
    if (latencyMs === null || latencyMs === undefined) return 'unknown';
    if (latencyMs < 50) return 'online';
    if (latencyMs < 150) return 'primary';
    if (latencyMs < 300) return 'issue';
    return 'offline';
}

function packetLossAccent(lossPct) {
    if (lossPct === null || lossPct === undefined) return 'unknown';
    if (lossPct === 0) return 'online';
    if (lossPct < 5) return 'primary';
    if (lossPct < 20) return 'issue';
    return 'offline';
}

// ONU optical-down states dari berbagai vendor OLT (ZTE/Huawei/HSGQ/CDATA).
// mapToStatus tidak kenal state ini → normalisasi ke 'offline' supaya badge
// merah. Set di module scope (bukan per-render). Lowercase semua.
const OPTICAL_DOWN_STATES = new Set([
    'offline', 'down', 'lost', 'power_down', 'dying_gasp', 'removed',
    'loi', 'los', 'auth_failed', 'auth-failed', 'onu_disable', 'onu-disable', 'disabled',
]);

/**
 * RX signal strength threshold (dBm) per industri standard GPON:
 *   >= -22 dBm → good (online)
 *   -22 to -25 → acceptable (primary)
 *   -25 to -28 → warning (issue)
 *   < -28      → critical (offline)
 */
function rxSignalAccent(dBm) {
    if (dBm === null || dBm === undefined || Number.isNaN(dBm)) return 'unknown';
    if (dBm >= -22) return 'online';
    if (dBm >= -25) return 'primary';
    if (dBm >= -28) return 'issue';
    return 'offline';
}

/**
 * Extract Serial Number dari GenieACS device data structure. Schema TR-098/TR-181.
 */
function extractSn(device) {
    if (!device) return null;
    return (
        device.InternetGatewayDevice?.DeviceInfo?.SerialNumber?._value
        || device.Device?.DeviceInfo?.SerialNumber?._value
        || device._serialNumber
        || device.sn
        || null
    );
}

/**
 * Robust truthy check untuk TR-098/TR-181 boolean fields.
 * GenieACS bisa simpan sebagai: true/false (bool), "true"/"false" (string),
 * "1"/"0" (string), 1/0 (number), "True"/"False" (capitalized).
 */
function isTrueish(v) {
    if (v === true || v === 1) return true;
    if (typeof v === 'string') {
        const s = v.toLowerCase();
        return s === 'true' || s === '1' || s === 'yes' || s === 'enabled';
    }
    return false;
}

/**
 * Count WiFi-associated devices (clients) per WLANConfiguration.
 * Mirror logic dari components/map/AcsTab.jsx getAssociatedDevices().
 */
function countWlanClients(wlan) {
    if (!wlan?.AssociatedDevice) return 0;
    return Object.keys(wlan.AssociatedDevice).filter(
        (key) => !key.startsWith('_') && /^\d+$/.test(key) && wlan.AssociatedDevice[key],
    ).length;
}

/**
 * Resolve LANDevice node — coba multiple schema paths supaya cocok dengan
 * vendor ZTE/Huawei/standard TR-098 + TR-181.
 */
function resolveLanDevice(device) {
    if (!device) return null;
    return (
        device.InternetGatewayDevice?.LANDevice?.[1]
        || device.InternetGatewayDevice?.LANDevice?.['1']
        || device.Device?.LANDevice?.[1]
        || device.Device?.LANDevice?.['1']
        || null
    );
}

/**
 * Enumerate WLANConfiguration + count clients per SSID. Return summary
 * untuk display di panel: { totalClients, ssidList }.
 *
 * Sebelumnya pakai check enable strict yang miss vendor variant boolean.
 * Sekarang isTrueish() handle multiple representation (true/1/"true"/"1"/dst).
 * Plus fallback: kalau Enable field absent total, anggap broadcasting
 * (some GenieACS fields tidak populate Enable kalau ONT WLAN config tidak
 * explicit set ke Disabled).
 */
function summarizeClients(device) {
    if (!device) return null;
    const lan = resolveLanDevice(device);
    if (!lan?.WLANConfiguration) return null;

    let totalClients = 0;
    const ssidList = [];

    Object.keys(lan.WLANConfiguration).forEach((key) => {
        if (key.startsWith('_')) return;
        if (!/^\d+$/.test(key)) return;
        const wlan = lan.WLANConfiguration[key];
        if (!wlan) return;

        // Enable check: pakai isTrueish robust. Kalau Enable field absent
        // (undefined), default ASSUME enabled — banyak ONT firmware tidak
        // populate Enable kalau WLAN auto-broadcast by config.
        const enableRaw = wlan.Enable?._value;
        const enabled = enableRaw === undefined ? true : isTrueish(enableRaw);

        // SSID tetap di-skip kalau tidak ada (truly absent WLAN slot)
        const ssid = wlan.SSID?._value;
        if (!ssid) return;

        const clients = countWlanClients(wlan);

        // Band detection: Standard field dulu (Huawei X_HW_HardwareMode juga
        // ada vendor variant), fallback ke index >= 5 (TR-098 convention).
        const standard = wlan.Standard?._value || wlan['X_HW_HardwareMode']?._value;
        const is5G =
            (standard && /11(ac|ax|a|n5)/i.test(String(standard))) || parseInt(key) >= 5;

        if (enabled) {
            ssidList.push({ ssid, clients, band: is5G ? '5G' : '2.4G' });
            totalClients += clients;
        }
    });

    return { totalClients, ssidList };
}

export function NetwatchDetailPanel({ isOpen, onClose, netwatch, onEditFull }) {
    const timezone = useAppTimezone();

    // Status Netwatch (ping/ICMP) — reachability dari router.
    const status = mapToStatus(netwatch?.status);
    const statusLabel = STATUS_LABELS[status];

    // Status fisik ONU/OLT (optical) — TERPISAH dari ping. Bisa beda:
    // mis. ping UP (host masih respons) tapi ONU "Removed from OLT" = down.
    // Ditampilkan dengan label sumber supaya operator tidak bingung.
    // Optical-down states tidak dikenali mapToStatus → normalisasi ke
    // 'offline' supaya badge merah, bukan abu.
    const physicalRaw = netwatch?.physicalStatus;
    const hasPhysicalStatus = !!physicalRaw && String(physicalRaw).toLowerCase() !== 'unknown';
    const physicalStatus = hasPhysicalStatus
        ? (OPTICAL_DOWN_STATES.has(String(physicalRaw).toLowerCase()) ? 'offline' : mapToStatus(physicalRaw))
        : null;
    const physicalLabel = physicalStatus ? STATUS_LABELS[physicalStatus] : null;
    const physicalReason = netwatch?.lastDownReason || null;

    const latencyMs = useMemo(() => {
        const raw = netwatch?.latency ?? netwatch?.latencyMs ?? netwatch?.responseTime;
        if (raw === null || raw === undefined) return null;
        return typeof raw === 'string' ? parseFloat(raw) : Number(raw);
    }, [netwatch]);

    const lossPct = useMemo(() => {
        const raw = netwatch?.packetLoss ?? netwatch?.loss ?? netwatch?.packet_loss;
        if (raw === null || raw === undefined) return null;
        return typeof raw === 'string' ? parseFloat(raw) : Number(raw);
    }, [netwatch]);

    const rxSignal = useMemo(() => {
        const raw = netwatch?.lastRxPower ?? netwatch?.rxPower ?? netwatch?.signal;
        if (raw === null || raw === undefined || raw === '') return null;
        const num = typeof raw === 'string' ? parseFloat(raw) : Number(raw);
        return Number.isNaN(num) ? null : num;
    }, [netwatch]);

    // Pattern dari OltTab.jsx — show OLT section kalau ada identity OLT/ONU
    const hasOltContext = !!(netwatch?.oltId || netwatch?.sn || netwatch?.linkedOnuId);

    // ACS shortcut available kalau ada SN + routerId
    const hasAcsContext = !!(netwatch?.sn && netwatch?.routerId);

    // Fetch ACS devices (cached 30s, 5min gc, no polling) untuk count
    // WiFi clients per ONU. Enabled hanya saat panel open + hasAcsContext
    // — hindari fetch yang tidak perlu di komponen yang tidak visible.
    const { data: acsDevices } = useGenieACSDevices(netwatch?.routerId, {
        enabled: isOpen && hasAcsContext,
        refetchInterval: false,
    });

    // Find device by SN (case-insensitive + _id fallback per AcsTab.jsx:106 pattern).
    // SN di DB bisa tersimpan beda casing dari GenieACS _serialNumber → exact
    // match silent-fail. Plus device._id sometimes contains SN as substring
    // (mis. ZTEGD123ABC ada di "9000-F609-ZTEGD123ABC").
    const acsDevice = useMemo(() => {
        if (!Array.isArray(acsDevices) || !netwatch?.sn) return null;
        const snLower = String(netwatch.sn).toLowerCase();
        return (
            acsDevices.find((d) => {
                const deviceSn = String(extractSn(d) || '').toLowerCase();
                if (deviceSn === snLower) return true;
                return String(d?._id || '').toLowerCase().includes(snLower);
            }) ?? null
        );
    }, [acsDevices, netwatch?.sn]);

    const clientSummary = useMemo(() => summarizeClients(acsDevice), [acsDevice]);

    if (!netwatch) return null;

    return (
        <SidePanel
            isOpen={isOpen}
            onClose={onClose}
            title={netwatch.name || netwatch.host || 'Netwatch Host'}
            subtitle={netwatch.host || netwatch.ipAddress || '—'}
            icon={Wifi}
            accent={status}
            footer={
                <button
                    type="button"
                    onClick={() => onEditFull?.(netwatch)}
                    className="flex items-center justify-center gap-2 w-full px-3 py-2 rounded-lg bg-primary/15 text-primary hover:bg-primary/25 transition-colors text-sm font-medium"
                >
                    <Edit className="w-3.5 h-3.5" aria-hidden="true" />
                    Detail Lengkap / Edit
                </button>
            }
        >
            <div className="px-5 py-4">
                {/* Status */}
                <div className="mb-4 pb-4 border-b border-slate-border/60">
                    <div className="text-[10px] font-bold uppercase tracking-widest text-fg-muted mb-1.5">Status</div>
                    <div className="flex flex-col gap-2">
                        {/* Status Netwatch (ping) — selalu tampil */}
                        <div className="flex items-center justify-between gap-2">
                            <span className="text-[10px] text-fg-muted uppercase tracking-wide">Netwatch (Ping)</span>
                            <span
                                className={clsx(
                                    'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md font-bold uppercase tracking-wider text-xs',
                                    STATUS_CLASSES[status].bg,
                                    STATUS_CLASSES[status].text,
                                    STATUS_CLASSES[status].ring,
                                )}
                            >
                                <span className={clsx('w-1.5 h-1.5 rounded-full', STATUS_CLASSES[status].dot)} aria-hidden="true" />
                                {statusLabel}
                            </span>
                        </div>

                        {/* Status ONU/OLT (optical) — hanya kalau ada data fisik.
                            Beri label + alasan (mis. "Removed from OLT") supaya
                            jelas ini status yang berbeda dari ping. */}
                        {physicalStatus && (
                            <div className="flex items-center justify-between gap-2">
                                <span className="text-[10px] text-fg-muted uppercase tracking-wide">
                                    ONU / OLT
                                </span>
                                <span
                                    className={clsx(
                                        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md font-bold uppercase tracking-wider text-xs',
                                        STATUS_CLASSES[physicalStatus].bg,
                                        STATUS_CLASSES[physicalStatus].text,
                                        STATUS_CLASSES[physicalStatus].ring,
                                    )}
                                >
                                    <span className={clsx('w-1.5 h-1.5 rounded-full', STATUS_CLASSES[physicalStatus].dot)} aria-hidden="true" />
                                    {physicalLabel}
                                </span>
                            </div>
                        )}

                        {/* Alasan down fisik (kalau ONU offline) */}
                        {physicalStatus && physicalStatus !== 'online' && physicalReason && (
                            <div className="text-[11px] text-status-issue leading-snug">
                                Alasan: {physicalReason}
                            </div>
                        )}
                    </div>
                </div>

                {/* Connection metrics */}
                <div className="text-[10px] font-bold uppercase tracking-widest text-fg-muted mb-2">Konektivitas</div>
                <div className="grid grid-cols-2 gap-2 mb-4">
                    <MetricCard
                        label="Latency"
                        value={latencyMs !== null ? `${latencyMs.toFixed(0)} ms` : '—'}
                        icon={Activity}
                        accent={latencyAccent(latencyMs)}
                    />
                    <MetricCard
                        label="Packet Loss"
                        value={lossPct !== null ? `${lossPct.toFixed(1)}%` : '—'}
                        icon={AlertTriangle}
                        accent={packetLossAccent(lossPct)}
                    />
                </div>

                {/* OLT section — tampil kalau device punya identity OLT/ONU */}
                {hasOltContext && (
                    <>
                        <div className="flex items-center justify-between mb-2">
                            <div className="text-[10px] font-bold uppercase tracking-widest text-fg-muted">OLT / ONU</div>
                            <button
                                type="button"
                                onClick={() => onEditFull?.(netwatch, 'olt')}
                                className="text-[10px] font-bold uppercase tracking-wider text-primary hover:underline"
                            >
                                Detail OLT →
                            </button>
                        </div>
                        <div className="grid grid-cols-2 gap-2 mb-4">
                            <MetricCard
                                label="RX Signal"
                                value={rxSignal !== null ? `${rxSignal.toFixed(2)} dBm` : '—'}
                                icon={Signal}
                                accent={rxSignalAccent(rxSignal)}
                            />
                            <MetricCard
                                label="PON Port"
                                value={netwatch.ponPort ?? '—'}
                                sub={netwatch.onuIndex !== undefined && netwatch.onuIndex !== null ? `ONU #${netwatch.onuIndex}` : null}
                                icon={Cable}
                                accent="primary"
                            />
                        </div>
                        {(netwatch.sn || netwatch.oltName) && (
                        <div className="bg-surface-darker/50 border border-slate-border/60 rounded-lg p-3 space-y-2.5 mb-4">
                            {netwatch.sn && (
                                <div className="flex items-start justify-between gap-3">
                                    <div className="flex items-center gap-2">
                                        <Radio className="w-3.5 h-3.5 text-fg-muted" aria-hidden="true" />
                                        <span className="text-[10px] font-bold uppercase tracking-wider text-fg-muted">
                                            Serial Number
                                        </span>
                                    </div>
                                    <span className="text-xs text-fg font-mono truncate max-w-[180px]" title={netwatch.sn}>
                                        {netwatch.sn}
                                    </span>
                                </div>
                            )}
                            {netwatch.oltName && (
                                <div className="flex items-start justify-between gap-3 pt-2.5 border-t border-slate-border/40">
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-fg-muted">
                                        OLT
                                    </span>
                                    <span className="text-xs text-fg truncate max-w-[180px]">{netwatch.oltName}</span>
                                </div>
                            )}
                        </div>
                        )}
                    </>
                )}

                {/* Connected Devices section — derive dari GenieACS data kalau ada.
                    Total WiFi clients + per-SSID breakdown. Wired LAN clients
                    tidak di-include (defer ke "Buka Tab ACS" untuk full detail). */}
                {hasAcsContext && clientSummary && (
                    <>
                        <div className="flex items-center justify-between mb-2">
                            <div className="text-[10px] font-bold uppercase tracking-widest text-fg-muted">
                                Klien Terhubung
                            </div>
                            {acsDevice && (
                                <button
                                    type="button"
                                    onClick={() => onEditFull?.(netwatch, 'acs')}
                                    className="text-[10px] font-bold uppercase tracking-wider text-primary hover:underline"
                                >
                                    Detail Klien →
                                </button>
                            )}
                        </div>
                        <div className="grid grid-cols-2 gap-2 mb-3">
                            <MetricCard
                                label="Total WiFi"
                                value={clientSummary.totalClients}
                                sub={clientSummary.totalClients > 0 ? 'connected' : 'no clients'}
                                icon={Users}
                                accent={clientSummary.totalClients > 0 ? 'online' : 'unknown'}
                            />
                            <MetricCard
                                label="SSID Aktif"
                                value={clientSummary.ssidList.length}
                                sub={clientSummary.ssidList.length > 0 ? 'broadcasting' : 'all off'}
                                icon={Wifi}
                                accent={clientSummary.ssidList.length > 0 ? 'primary' : 'unknown'}
                            />
                        </div>

                        {clientSummary.ssidList.length > 0 && (
                            <div className="bg-surface-darker/50 border border-slate-border/60 rounded-lg p-3 space-y-2 mb-4">
                                {clientSummary.ssidList.map((s, idx) => (
                                    <div
                                        key={`${s.ssid}-${idx}`}
                                        className={clsx(
                                            'flex items-center justify-between gap-3',
                                            idx > 0 && 'pt-2 border-t border-slate-border/40',
                                        )}
                                    >
                                        <div className="flex items-center gap-2 min-w-0">
                                            <Wifi className="w-3.5 h-3.5 text-fg-muted shrink-0" aria-hidden="true" />
                                            <span className="text-xs text-fg truncate font-medium">{s.ssid}</span>
                                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-slate-surface text-fg-muted shrink-0">
                                                {s.band}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-1 shrink-0">
                                            <Laptop className="w-3 h-3 text-fg-muted" aria-hidden="true" />
                                            <span
                                                className={clsx(
                                                    'text-xs font-bold tabular-nums',
                                                    s.clients > 0 ? 'text-status-online' : 'text-fg-muted',
                                                )}
                                            >
                                                {s.clients}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                )}

                {/* ACS shortcut — kalau ada SN + router parent */}
                {hasAcsContext && (
                    <>
                        <div className="text-[10px] font-bold uppercase tracking-widest text-fg-muted mb-2">GenieACS</div>
                        <button
                            type="button"
                            onClick={() => onEditFull?.(netwatch, 'acs')}
                            className="flex items-center justify-between w-full bg-primary/10 hover:bg-primary/20 border border-primary/30 rounded-lg p-3 mb-4 transition-colors group"
                        >
                            <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-md bg-primary/15 flex items-center justify-center">
                                    <Wifi className="w-4 h-4 text-primary" aria-hidden="true" />
                                </div>
                                <div className="text-left">
                                    <div className="text-xs font-bold text-fg">Buka Tab ACS</div>
                                    <div className="text-[10px] text-fg-muted">SSID, IP, model, firmware, clients</div>
                                </div>
                            </div>
                            <ExternalLink className="w-3.5 h-3.5 text-fg-muted group-hover:text-primary" aria-hidden="true" />
                        </button>
                    </>
                )}

                {/* Info section — Last Seen, Parent Router, Device Type */}
                <div className="text-[10px] font-bold uppercase tracking-widest text-fg-muted mb-2">Info</div>
                <div className="bg-surface-darker/50 border border-slate-border/60 rounded-lg p-3 space-y-2.5">
                    <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2">
                            <Clock className="w-3.5 h-3.5 text-fg-muted" aria-hidden="true" />
                            <span className="text-[10px] font-bold uppercase tracking-wider text-fg-muted">Last Seen</span>
                        </div>
                        <span className="text-xs text-fg">
                            {netwatch.lastSeen ? formatShortDateTime(netwatch.lastSeen, timezone) : '—'}
                        </span>
                    </div>

                    {netwatch.routerName && (
                        <div className="flex items-start justify-between gap-3 pt-2.5 border-t border-slate-border/40">
                            <div className="flex items-center gap-2">
                                <RouterIcon className="w-3.5 h-3.5 text-fg-muted" aria-hidden="true" />
                                <span className="text-[10px] font-bold uppercase tracking-wider text-fg-muted">
                                    Router Parent
                                </span>
                            </div>
                            {netwatch.routerId ? (
                                <Link
                                    to={`/routers/${netwatch.routerId}`}
                                    onClick={onClose}
                                    className="text-xs text-primary hover:underline truncate max-w-[170px]"
                                >
                                    {netwatch.routerName}
                                </Link>
                            ) : (
                                <span className="text-xs text-fg truncate max-w-[170px]">{netwatch.routerName}</span>
                            )}
                        </div>
                    )}

                    {netwatch.deviceType && (
                        <div className="flex items-start justify-between gap-3 pt-2.5 border-t border-slate-border/40">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-fg-muted">
                                Device Type
                            </span>
                            <span className="text-xs text-fg capitalize">{netwatch.deviceType}</span>
                        </div>
                    )}
                </div>

                {/* Penanda Jarak di Garis (tersimpan) */}
                {(() => {
                    let markers = [];
                    try {
                        const dm = netwatch.distanceMarkers;
                        markers = Array.isArray(dm) ? dm : (dm ? JSON.parse(dm) : []);
                    } catch { markers = []; }
                    if (!Array.isArray(markers) || markers.length === 0) return null;
                    return (
                        <div className="mt-4">
                            <div className="text-[10px] font-bold uppercase tracking-widest text-fg-muted mb-2">Penanda Jarak di Garis</div>
                            <div className="bg-surface-darker/50 border border-slate-border/60 rounded-lg p-3 space-y-2">
                                {markers.map((m, i) => (
                                    <div key={i} className="flex items-center justify-between gap-2 text-xs">
                                        <span className="flex items-center gap-2 min-w-0">
                                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0 ${m.side === 'dest' ? 'bg-amber-500/15 text-amber-400' : 'bg-cyan-500/15 text-cyan-400'}`}>
                                                {m.side === 'dest' ? 'DEST' : 'SOURCE'}
                                            </span>
                                            {m.label && <span className="text-fg-muted truncate">{m.label}</span>}
                                        </span>
                                        <span className="text-fg font-mono shrink-0">{m.meters} m</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    );
                })()}
            </div>
        </SidePanel>
    );
}

export default NetwatchDetailPanel;
