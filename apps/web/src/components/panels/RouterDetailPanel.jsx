import React, { useMemo } from 'react';
import clsx from 'clsx';
import { Router, Cpu, MemoryStick, Clock, Activity, Users, Edit, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import SidePanel from './SidePanel';
import { useRouterMetrics, useRouterPppActive, useAppTimezone } from '@/hooks';
import { mapToStatus, STATUS_CLASSES, STATUS_LABELS } from '@/constants/status';

/**
 * RouterDetailPanel — Quick view router stats saat klik marker di map.
 *
 * Brief user (Step 4):
 *   - Panel detail router: CPU%, Memory%, Uptime, jumlah netwatch host, jumlah PPPoE aktif
 *
 * Props:
 *   isOpen: boolean
 *   onClose: () => void
 *   router: object | null   — router data dari marker click
 *   netwatchCount: number   — derived dari NetworkMap (count entries for this router)
 *   onEditFull: (router) => void — klik tombol Edit → buka DeviceModal lama
 *
 * Data flow (container split — panel fetch metric sendiri pakai TanStack Query):
 *   - router prop: nama, IP, status, lat/lng
 *   - useRouterMetrics(routerId): CPU/Memory/Uptime — polling 10s
 *   - useRouterPppActive(routerId): array PPPoE active sessions
 *
 * Reference: docs/REFACTORING-PLAN.md Part B + brief.
 */

/**
 * @param {{ label: string, value: string | number, sub?: string, icon: React.ComponentType, accent?: 'primary' | 'online' | 'offline' | 'issue' }} props
 */
function MetricCard({ label, value, sub, icon: Icon, accent = 'primary' }) {
    const colorMap = {
        primary: 'text-primary bg-primary/10',
        online: 'text-status-online bg-status-online/10',
        offline: 'text-status-offline bg-status-offline/10',
        issue: 'text-status-issue bg-status-issue/10',
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

function formatUptime(seconds) {
    if (!seconds || seconds < 0) return '—';
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (days > 0) return `${days}h ${hours}j`;
    if (hours > 0) return `${hours}j ${minutes}m`;
    return `${minutes}m`;
}

function parseUptimeString(uptime) {
    if (typeof uptime === 'number') return uptime;
    if (typeof uptime !== 'string') return null;
    // MikroTik format: "1w2d3h4m5s" — parse roughly
    const match = uptime.match(/(?:(\d+)w)?(?:(\d+)d)?(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?/);
    if (!match) return null;
    const [, w = 0, d = 0, h = 0, m = 0, s = 0] = match.map((v) => (v ? Number(v) : 0));
    return w * 604800 + d * 86400 + h * 3600 + m * 60 + s;
}

export function RouterDetailPanel({ isOpen, onClose, router, netwatchCount = 0, onEditFull }) {
    const routerId = router?.id;
    const { data: metrics } = useRouterMetrics(routerId, { enabled: isOpen && !!routerId });
    const { data: pppActive } = useRouterPppActive(routerId, { enabled: isOpen && !!routerId });

    const status = mapToStatus(router?.status);
    const statusLabel = STATUS_LABELS[status];

    const cpuPercent = useMemo(() => {
        const raw = metrics?.cpuLoad ?? metrics?.cpu ?? metrics?.cpu_load;
        if (raw === undefined || raw === null) return null;
        return Math.round(Number(raw));
    }, [metrics]);

    const memPercent = useMemo(() => {
        const total = metrics?.totalMemory ?? metrics?.total_memory ?? metrics?.memoryTotal;
        const free = metrics?.freeMemory ?? metrics?.free_memory ?? metrics?.memoryFree;
        if (total && free !== undefined) {
            const used = total - free;
            return Math.round((used / total) * 100);
        }
        const usagePct = metrics?.memoryUsage ?? metrics?.memory_usage;
        return usagePct !== undefined ? Math.round(Number(usagePct)) : null;
    }, [metrics]);

    const uptimeSeconds = useMemo(() => {
        const raw = metrics?.uptime ?? router?.uptime;
        return parseUptimeString(raw);
    }, [metrics, router]);

    const pppActiveCount = Array.isArray(pppActive) ? pppActive.length : 0;

    if (!router) return null;

    return (
        <SidePanel
            isOpen={isOpen}
            onClose={onClose}
            title={router.name || router.host || 'Router'}
            subtitle={router.host || router.ipAddress || '—'}
            icon={Router}
            accent={status}
            footer={
                <div className="flex flex-col gap-2">
                    <button
                        type="button"
                        onClick={() => onEditFull?.(router)}
                        className="flex items-center justify-center gap-2 w-full px-3 py-2 rounded-lg bg-primary/15 text-primary hover:bg-primary/25 transition-colors text-sm font-medium"
                    >
                        <Edit className="w-3.5 h-3.5" aria-hidden="true" />
                        Detail Lengkap / Edit
                    </button>
                    <Link
                        to={`/routers/${router.id}`}
                        onClick={onClose}
                        className="flex items-center justify-center gap-2 w-full px-3 py-2 rounded-lg text-fg-muted hover:text-fg hover:bg-white/5 transition-colors text-xs"
                    >
                        Buka Halaman Router
                        <ExternalLink className="w-3 h-3" aria-hidden="true" />
                    </Link>
                </div>
            }
        >
            <div className="px-5 py-4">
                {/* Status section */}
                <div className="mb-4 pb-4 border-b border-slate-border/60">
                    <div className="text-[10px] font-bold uppercase tracking-widest text-fg-muted mb-1.5">Status</div>
                    <div className="flex items-center gap-2">
                        <span
                            className={clsx(
                                'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md font-bold uppercase tracking-wider text-xs',
                                STATUS_CLASSES[status].bg,
                                STATUS_CLASSES[status].text,
                                STATUS_CLASSES[status].ring,
                            )}
                        >
                            <span
                                className={clsx('w-1.5 h-1.5 rounded-full', STATUS_CLASSES[status].dot)}
                                aria-hidden="true"
                            />
                            {statusLabel}
                        </span>
                        {router.lastSync && (
                            <span className="text-xs text-fg-muted">
                                Last sync: {new Date(router.lastSync).toLocaleString('id-ID')}
                            </span>
                        )}
                    </div>
                </div>

                {/* Resource metrics grid */}
                <div className="text-[10px] font-bold uppercase tracking-widest text-fg-muted mb-2">Resource</div>
                <div className="grid grid-cols-2 gap-2 mb-4">
                    <MetricCard
                        label="CPU"
                        value={cpuPercent !== null ? `${cpuPercent}%` : '—'}
                        sub={cpuPercent !== null && cpuPercent > 80 ? 'Tinggi' : null}
                        icon={Cpu}
                        accent={cpuPercent !== null && cpuPercent > 80 ? 'offline' : 'primary'}
                    />
                    <MetricCard
                        label="Memory"
                        value={memPercent !== null ? `${memPercent}%` : '—'}
                        sub={memPercent !== null && memPercent > 80 ? 'Tinggi' : null}
                        icon={MemoryStick}
                        accent={memPercent !== null && memPercent > 80 ? 'offline' : 'primary'}
                    />
                    <MetricCard
                        label="Uptime"
                        value={formatUptime(uptimeSeconds)}
                        icon={Clock}
                        accent="online"
                    />
                    <MetricCard
                        label="Board"
                        value={metrics?.boardName || router.boardName || '—'}
                        sub={metrics?.routerOsVersion || router.routerOsVersion || null}
                        icon={Activity}
                        accent="primary"
                    />
                </div>

                {/* Connected entities */}
                <div className="text-[10px] font-bold uppercase tracking-widest text-fg-muted mb-2">Konektivitas</div>
                <div className="grid grid-cols-2 gap-2">
                    <MetricCard
                        label="Netwatch Host"
                        value={netwatchCount}
                        sub={netwatchCount > 0 ? 'monitored' : null}
                        icon={Activity}
                        accent="primary"
                    />
                    <MetricCard
                        label="PPPoE Aktif"
                        value={pppActiveCount}
                        sub={pppActiveCount > 0 ? 'connected' : null}
                        icon={Users}
                        accent="online"
                    />
                </div>
            </div>
        </SidePanel>
    );
}

export default RouterDetailPanel;
