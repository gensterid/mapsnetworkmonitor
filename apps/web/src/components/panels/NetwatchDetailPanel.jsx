import React, { useMemo } from 'react';
import clsx from 'clsx';
import { Wifi, Activity, Clock, AlertTriangle, Edit, Router as RouterIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import SidePanel from './SidePanel';
import { mapToStatus, STATUS_CLASSES, STATUS_LABELS } from '@/constants/status';
import { useAppTimezone } from '@/hooks';
import { formatShortDateTime } from '@/lib/timezone';

/**
 * NetwatchDetailPanel — Quick view netwatch host saat klik marker.
 *
 * Brief user:
 *   - Panel detail netwatch host: IP, status, latency (ms), packet loss (%), last seen
 *
 * Props:
 *   isOpen: boolean
 *   onClose: () => void
 *   netwatch: object | null   — netwatch entry dari marker click
 *     Expected fields: id, host, name, status, latency, packetLoss, lastSeen,
 *                       routerId, routerName
 *   onEditFull: (netwatch) => void — klik tombol Edit → buka DeviceModal lama
 *
 * Data flow (presentational only — semua data dari prop):
 *   - netwatch prop berisi semua field yang dibutuhkan dari NetworkMap parent
 *   - Tidak fetch sendiri (low-frequency data, sudah ada di stableNetwatchData)
 */

/**
 * @param {{ label: string, value: string | number, icon: React.ComponentType, accent?: string, sub?: string }} props
 */
function MetricCard({ label, value, icon: Icon, accent = 'primary', sub }) {
    const colorMap = {
        primary: 'text-primary bg-primary/10',
        online: 'text-status-online bg-status-online/10',
        offline: 'text-status-offline bg-status-offline/10',
        issue: 'text-status-issue bg-status-issue/10',
        unknown: 'text-status-unknown bg-status-unknown/10',
    };
    return (
        <div className="bg-surface-darker/50 border border-slate-border/60 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1.5">
                <div className={clsx('w-6 h-6 rounded flex items-center justify-center', colorMap[accent])}>
                    <Icon className="w-3.5 h-3.5" aria-hidden="true" />
                </div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-fg-muted">{label}</span>
            </div>
            <div className="text-xl font-bold text-fg">{value}</div>
            {sub && <div className="text-xs text-fg-muted mt-0.5">{sub}</div>}
        </div>
    );
}

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
                {/* Status section */}
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

                {/* Last seen + parent router */}
                <div className="text-[10px] font-bold uppercase tracking-widest text-fg-muted mb-2">Info</div>
                <div className="bg-surface-darker/50 border border-slate-border/60 rounded-lg p-3 space-y-2.5">
                    <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2">
                            <Clock className="w-3.5 h-3.5 text-fg-muted" aria-hidden="true" />
                            <span className="text-[10px] font-bold uppercase tracking-wider text-fg-muted">
                                Last Seen
                            </span>
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
