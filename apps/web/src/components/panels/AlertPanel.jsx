import React, { useState, useMemo } from 'react';
import clsx from 'clsx';
import { Bell, ExternalLink, AlertCircle, Info, AlertOctagon, AlertTriangle } from 'lucide-react';
import { Link } from 'react-router-dom';
import SidePanel from './SidePanel';
import { useAlerts } from '@/hooks';
import { useAppTimezone } from '@/hooks';
import { formatShortDateTime } from '@/lib/timezone';
import { severityToStatus, STATUS_CLASSES } from '@/constants/status';

/**
 * AlertPanel — Quick view alert list dengan filter severity.
 *
 * Brief user:
 *   - Panel alert: list alert terbaru, bisa di-filter berdasarkan severity
 *   - Tombol tutup (X) jelas — dari SidePanel wrapper
 *
 * Trigger:
 *   - Klik alert row di FloatingStatusCounter (di map)
 *   - Atau prop open dari komponen lain
 *
 * Data: useAlerts({ limit: 50, sortOrder: 'desc' }) — TanStack Query polling.
 * Filter di client side (severity chips).
 *
 * Severity → status warna (single source via severityToStatus):
 *   critical → offline (red)
 *   high     → issue   (yellow)
 *   medium   → issue
 *   low      → unknown
 *   info     → online
 */

/**
 * Severity label + icon untuk berbagai naming convention yang dipakai backend.
 * Kalau backend pakai severity baru yang tidak ada di sini, chip tetap muncul
 * dengan label uppercase + icon Info default (lihat severityMeta() di bawah).
 */
const SEVERITY_META = {
    critical: { label: 'Critical', icon: AlertOctagon },
    high: { label: 'High', icon: AlertTriangle },
    warning: { label: 'Warning', icon: AlertTriangle },
    medium: { label: 'Medium', icon: AlertCircle },
    low: { label: 'Low', icon: Info },
    info: { label: 'Info', icon: Info },
};

function severityMeta(sev) {
    return SEVERITY_META[sev] || { label: sev?.toUpperCase() || 'UNKNOWN', icon: Info };
}

function AlertRow({ alert, timezone }) {
    const status = severityToStatus(alert.severity);
    const colors = STATUS_CLASSES[status];
    const SevIcon = severityMeta(alert.severity?.toLowerCase()).icon;

    return (
        <div className="px-5 py-3 border-b border-slate-border/50 hover:bg-white/[0.02] transition-colors">
            <div className="flex items-start gap-3">
                <div className={clsx('w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0', colors.bg)}>
                    <SevIcon className={clsx('w-4 h-4', colors.text)} aria-hidden="true" />
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-start gap-2 mb-1">
                        <h4 className="text-sm font-semibold text-fg flex-1 min-w-0 leading-tight">
                            {alert.title || alert.message || 'Alert tanpa judul'}
                        </h4>
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
                    {alert.message && alert.title && (
                        <p className="text-xs text-fg-muted leading-snug mb-1.5 line-clamp-2">
                            {alert.message}
                        </p>
                    )}
                    <div className="flex items-center gap-2 text-[10px] text-fg-muted">
                        {alert.routerName && (
                            <>
                                <span className="font-medium">{alert.routerName}</span>
                                <span aria-hidden="true">·</span>
                            </>
                        )}
                        <time dateTime={alert.createdAt}>
                            {alert.createdAt
                                ? formatShortDateTime(alert.createdAt, timezone)
                                : '—'}
                        </time>
                    </div>
                </div>
            </div>
        </div>
    );
}

export function AlertPanel({ isOpen, onClose }) {
    const [severityFilter, setSeverityFilter] = useState('all');
    const timezone = useAppTimezone();

    const { data, isLoading, isError } = useAlerts(
        { limit: 50, sortOrder: 'desc' },
        { enabled: isOpen },
    );

    // alertService.getAll() return shape bisa { data: [], meta: {} } ATAU array langsung
    const allAlerts = useMemo(() => {
        if (!data) return [];
        if (Array.isArray(data)) return data;
        if (Array.isArray(data.data)) return data.data;
        if (Array.isArray(data.alerts)) return data.alerts;
        return [];
    }, [data]);

    // Filter client side berdasarkan severity chip
    const filteredAlerts = useMemo(() => {
        if (severityFilter === 'all') return allAlerts;
        return allAlerts.filter(
            (a) => (a.severity || '').toLowerCase() === severityFilter,
        );
    }, [allAlerts, severityFilter]);

    // Severity chip dynamic — generate dari data real, jadi backend pakai naming
    // apapun (critical/high/warning/medium/low/info), chip-nya muncul.
    // Sebelumnya hardcoded critical/high/medium/low — kalau data pakai 'warning'
    // (yang umum di MikroTik netwatch), chip-nya kosong padahal data ada.
    const severityChips = useMemo(() => {
        const counts = new Map();
        allAlerts.forEach((a) => {
            const sev = (a.severity || '').toLowerCase();
            if (!sev) return;
            counts.set(sev, (counts.get(sev) || 0) + 1);
        });
        // Sort: severity yang lebih kritis di kiri (critical > high > warning > medium > low > info)
        const order = ['critical', 'high', 'warning', 'medium', 'low', 'info'];
        return Array.from(counts.entries()).sort((a, b) => {
            const ia = order.indexOf(a[0]);
            const ib = order.indexOf(b[0]);
            if (ia === -1 && ib === -1) return a[0].localeCompare(b[0]);
            if (ia === -1) return 1;
            if (ib === -1) return -1;
            return ia - ib;
        });
    }, [allAlerts]);

    return (
        <SidePanel
            isOpen={isOpen}
            onClose={onClose}
            title="Alert Terkini"
            icon={Bell}
            subtitle={`${allAlerts.length} alert dalam 24 jam terakhir`}
            accent="offline"
            footer={
                <Link
                    to="/alerts"
                    onClick={onClose}
                    className="flex items-center justify-center gap-2 w-full px-3 py-2 rounded-lg bg-primary/15 text-primary hover:bg-primary/25 transition-colors text-sm font-medium"
                >
                    Lihat Semua Alert
                    <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                </Link>
            }
        >
            {/* Severity filter chip row — dynamic dari data real */}
            <div className="sticky top-0 z-10 bg-surface-dark border-b border-slate-border px-3 py-2.5 flex items-center gap-1 overflow-x-auto custom-scrollbar">
                {/* "Semua" chip selalu ada */}
                <button
                    type="button"
                    onClick={() => setSeverityFilter('all')}
                    aria-pressed={severityFilter === 'all'}
                    className={clsx(
                        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider transition-colors whitespace-nowrap',
                        severityFilter === 'all'
                            ? 'bg-primary text-white'
                            : 'text-fg-muted hover:text-fg hover:bg-white/5',
                    )}
                >
                    Semua
                    <span
                        className={clsx(
                            'px-1 rounded text-[9px]',
                            severityFilter === 'all' ? 'bg-white/20' : 'bg-slate-surface',
                        )}
                    >
                        {allAlerts.length}
                    </span>
                </button>

                {/* Dynamic chips per severity yang muncul di data */}
                {severityChips.map(([sev, count]) => {
                    const isActive = severityFilter === sev;
                    const meta = severityMeta(sev);
                    return (
                        <button
                            key={sev}
                            type="button"
                            onClick={() => setSeverityFilter(sev)}
                            aria-pressed={isActive}
                            className={clsx(
                                'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider transition-colors whitespace-nowrap',
                                isActive
                                    ? 'bg-primary text-white'
                                    : 'text-fg-muted hover:text-fg hover:bg-white/5',
                            )}
                        >
                            {meta.label}
                            <span
                                className={clsx(
                                    'px-1 rounded text-[9px]',
                                    isActive ? 'bg-white/20' : 'bg-slate-surface',
                                )}
                            >
                                {count}
                            </span>
                        </button>
                    );
                })}
            </div>

            {/* Alert list */}
            <div>
                {isLoading && (
                    <div className="px-5 py-8 text-center text-sm text-fg-muted">
                        Memuat alert...
                    </div>
                )}

                {isError && (
                    <div className="px-5 py-8 text-center">
                        <AlertCircle className="w-6 h-6 text-status-offline mx-auto mb-2" aria-hidden="true" />
                        <p className="text-sm text-fg-muted">Gagal memuat data alert.</p>
                    </div>
                )}

                {!isLoading && !isError && filteredAlerts.length === 0 && (
                    <div className="px-5 py-8 text-center">
                        <Bell className="w-6 h-6 text-fg-muted mx-auto mb-2" aria-hidden="true" />
                        <p className="text-sm text-fg-muted">
                            {severityFilter === 'all'
                                ? 'Tidak ada alert. Semua sistem normal.'
                                : `Tidak ada alert dengan severity "${severityFilter}".`}
                        </p>
                    </div>
                )}

                {!isLoading && !isError && filteredAlerts.length > 0 && (
                    <div>
                        {filteredAlerts.map((alert) => (
                            <AlertRow key={alert.id} alert={alert} timezone={timezone} />
                        ))}
                    </div>
                )}
            </div>
        </SidePanel>
    );
}

export default AlertPanel;
