import React, { useMemo } from 'react';
import clsx from 'clsx';
import { Router, Cpu, MemoryStick, Clock, Activity, Users, Edit, ExternalLink, Wifi, Bell, AlertCircle, AlertOctagon, AlertTriangle, Info } from 'lucide-react';
import { Link } from 'react-router-dom';
import SidePanel from './SidePanel';
import MetricCard from './MetricCard';
import { useRouterMetrics, useRouterPppActive, useRouterHotspotActive, useAlerts, useAppTimezone } from '@/hooks';
import { formatShortDateTime } from '@/lib/timezone';
import { mapToStatus, STATUS_CLASSES, STATUS_LABELS, severityToStatus } from '@/constants/status';

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
 * Format detik uptime jadi tampilan ringkas Bahasa Indonesia.
 * Per code-review M2: pakai label konsisten (hari/jam/menit) supaya tidak
 * ambigu dengan suffix "h" yang bisa salah baca sebagai "hours".
 */
function formatUptime(seconds) {
    if (!seconds || seconds < 0) return '—';
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (days > 0) return `${days} hari ${hours} jam`;
    if (hours > 0) return `${hours} jam ${minutes} menit`;
    return `${minutes} menit`;
}

/**
 * Parse string uptime MikroTik "1w2d3h4m5s" jadi detik.
 * Per code-review M1: pakai anchor ^...$ + reject pattern yang semua group
 * kosong. Sebelumnya regex tanpa anchor match string apapun jadi "0m".
 */
function parseUptimeString(uptime) {
    if (typeof uptime === 'number') return uptime;
    if (typeof uptime !== 'string') return null;
    const trimmed = uptime.trim();
    if (!trimmed) return null;
    const match = trimmed.match(/^(?:(\d+)w)?(?:(\d+)d)?(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
    if (!match) return null;
    // Kalau semua capture group undefined, berarti input tidak match format.
    const groups = match.slice(1);
    if (groups.every((v) => v === undefined)) return null;
    const [w = 0, d = 0, h = 0, m = 0, s = 0] = groups.map((v) => (v ? Number(v) : 0));
    return w * 604800 + d * 86400 + h * 3600 + m * 60 + s;
}

// Severity → icon mapping untuk Recent Alerts list (consistent dengan AlertPanel).
const SEVERITY_ICONS = {
    critical: AlertOctagon,
    high: AlertTriangle,
    warning: AlertTriangle,
    medium: AlertCircle,
    low: Info,
    info: Info,
};

function severityIconFor(sev) {
    return SEVERITY_ICONS[String(sev || '').toLowerCase()] || Info;
}

export function RouterDetailPanel({ isOpen, onClose, router, netwatchCount = 0, onEditFull }) {
    const routerId = router?.id;
    const timezone = useAppTimezone();
    const { data: metrics } = useRouterMetrics(routerId, { enabled: isOpen && !!routerId });
    const { data: pppActive } = useRouterPppActive(routerId, { enabled: isOpen && !!routerId });
    const { data: hotspotActive } = useRouterHotspotActive(routerId, {
        enabled: isOpen && !!routerId,
        refetchInterval: false, // panel quick-view, no polling
    });
    // Recent alerts: ambil 50 terbaru lalu filter by routerId client-side.
    // useAlerts cached + polling 30s — share cache dengan AlertPanel (kalau pernah dibuka).
    const { data: alertsResp } = useAlerts(
        { limit: 50, sortOrder: 'desc' },
        { enabled: isOpen && !!routerId },
    );

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
    const hotspotActiveCount = Array.isArray(hotspotActive) ? hotspotActive.length : 0;

    // Filter alerts untuk router ini + ambil 3 paling baru
    const recentAlerts = useMemo(() => {
        if (!routerId) return [];
        const raw = Array.isArray(alertsResp)
            ? alertsResp
            : Array.isArray(alertsResp?.data)
              ? alertsResp.data
              : Array.isArray(alertsResp?.alerts)
                ? alertsResp.alerts
                : [];
        return raw.filter((a) => a.routerId === routerId).slice(0, 3);
    }, [alertsResp, routerId]);

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
                <div className="grid grid-cols-2 gap-2 mb-4">
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
                    <MetricCard
                        label="Hotspot Aktif"
                        value={hotspotActiveCount}
                        sub={hotspotActiveCount > 0 ? 'connected' : null}
                        icon={Wifi}
                        accent={hotspotActiveCount > 0 ? 'online' : 'unknown'}
                    />
                </div>

                {/* Recent Alerts — tampil kalau ada alert untuk router ini */}
                {recentAlerts.length > 0 && (
                    <>
                        <div className="flex items-center justify-between mb-2">
                            <div className="text-[10px] font-bold uppercase tracking-widest text-fg-muted">
                                Alert Terkini
                            </div>
                            <Link
                                to={`/alerts?routerId=${router.id}`}
                                onClick={onClose}
                                className="text-[10px] font-bold uppercase tracking-wider text-primary hover:underline"
                            >
                                Lihat Semua →
                            </Link>
                        </div>
                        <div className="bg-surface-darker/50 border border-slate-border/60 rounded-lg p-3 space-y-2.5">
                            {recentAlerts.map((alert, idx) => {
                                const status = severityToStatus(alert.severity);
                                const colors = STATUS_CLASSES[status];
                                const SevIcon = severityIconFor(alert.severity);
                                return (
                                    <div
                                        key={alert.id ?? `${alert.title}-${idx}`}
                                        className={clsx(
                                            'flex items-start gap-2.5',
                                            idx > 0 && 'pt-2.5 border-t border-slate-border/40',
                                        )}
                                    >
                                        <div
                                            className={clsx(
                                                'w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0',
                                                colors.bg,
                                            )}
                                        >
                                            <SevIcon className={clsx('w-3.5 h-3.5', colors.text)} aria-hidden="true" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-start gap-2">
                                                <p className="text-xs font-semibold text-fg leading-tight flex-1 line-clamp-2">
                                                    {alert.title || alert.message || 'Alert tanpa judul'}
                                                </p>
                                                <span
                                                    className={clsx(
                                                        'text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0',
                                                        colors.bg,
                                                        colors.text,
                                                    )}
                                                >
                                                    {alert.severity || 'info'}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-1.5 mt-1 text-[10px] text-fg-muted">
                                                <Bell className="w-2.5 h-2.5" aria-hidden="true" />
                                                <time dateTime={alert.createdAt}>
                                                    {alert.createdAt ? formatShortDateTime(alert.createdAt, timezone) : '—'}
                                                </time>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </>
                )}
            </div>
        </SidePanel>
    );
}

export default RouterDetailPanel;
