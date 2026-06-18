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
} from 'lucide-react';
import { Link } from 'react-router-dom';
import SidePanel from './SidePanel';
import MetricCard from './MetricCard';
import { mapToStatus, STATUS_CLASSES, STATUS_LABELS } from '@/constants/status';
import { useAppTimezone } from '@/hooks';
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

export function NetwatchDetailPanel({ isOpen, onClose, netwatch, onEditFull }) {
    const timezone = useAppTimezone();

    const status = mapToStatus(netwatch?.status);
    const statusLabel = STATUS_LABELS[status];

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
            </div>
        </SidePanel>
    );
}

export default NetwatchDetailPanel;
