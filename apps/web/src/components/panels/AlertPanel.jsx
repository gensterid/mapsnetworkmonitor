import React, { useState, useMemo } from 'react';
import clsx from 'clsx';
import { Bell, ExternalLink, AlertTriangle, AlertCircle, Info, AlertOctagon } from 'lucide-react';
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

const SEVERITY_FILTERS = [
    { value: 'all', label: 'Semua', icon: Bell },
    { value: 'critical', label: 'Critical', icon: AlertOctagon },
    { value: 'high', label: 'High', icon: AlertTriangle },
    { value: 'medium', label: 'Medium', icon: AlertCircle },
    { value: 'low', label: 'Low', icon: Info },
];

const SEVERITY_ICONS = {
    critical: AlertOctagon,
    high: AlertTriangle,
    medium: AlertCircle,
    low: Info,
    info: Info,
};

function AlertRow({ alert, timezone }) {
    const status = severityToStatus(alert.severity);
    const colors = STATUS_CLASSES[status];
    const SevIcon = SEVERITY_ICONS[alert.severity?.toLowerCase()] || Info;

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

    // Hitung count per severity untuk badge di chip
    const counts = useMemo(() => {
        const result = { all: allAlerts.length, critical: 0, high: 0, medium: 0, low: 0 };
        allAlerts.forEach((a) => {
            const sev = (a.severity || '').toLowerCase();
            if (sev in result) result[sev] += 1;
        });
        return result;
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
            {/* Severity filter chip row */}
            <div className="sticky top-0 z-10 bg-surface-dark border-b border-slate-border px-3 py-2.5 flex items-center gap-1 overflow-x-auto custom-scrollbar">
                {SEVERITY_FILTERS.map((f) => {
                    const isActive = severityFilter === f.value;
                    const count = counts[f.value] ?? 0;
                    return (
                        <button
                            key={f.value}
                            type="button"
                            onClick={() => setSeverityFilter(f.value)}
                            aria-pressed={isActive}
                            className={clsx(
                                'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider transition-colors whitespace-nowrap',
                                isActive
                                    ? 'bg-primary text-white'
                                    : 'text-fg-muted hover:text-fg hover:bg-white/5',
                            )}
                        >
                            {f.label}
                            {count > 0 && (
                                <span
                                    className={clsx(
                                        'px-1 rounded text-[9px]',
                                        isActive ? 'bg-white/20' : 'bg-slate-surface',
                                    )}
                                >
                                    {count}
                                </span>
                            )}
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
