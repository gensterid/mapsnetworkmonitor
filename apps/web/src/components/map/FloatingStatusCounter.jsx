import React, { useState } from 'react';
import clsx from 'clsx';
import { Bell, ChevronUp, ChevronDown } from 'lucide-react';
import { Link } from 'react-router-dom';

/**
 * FloatingStatusCounter — Floating badge di pojok kanan atas map.
 *
 * Format (sesuai brief user):
 *   ┌─────────────────────────┐
 *   │ ROUTER                  │
 *   │ 🟢 245  🔴 12  🟡 5     │
 *   │─────────────────────────│
 *   │ 🔔 8 Alert Unread       │
 *   └─────────────────────────┘
 *
 * Klik Alert row → navigate ke /alerts.
 * Collapsible: persist state ke localStorage supaya tidak balik expand setiap refresh.
 *
 * Token warna dari src/constants/status.js (single source).
 */

function StatusPill({ status, count }) {
    const colorMap = {
        online: 'bg-status-online/15 text-status-online',
        offline: 'bg-status-offline/15 text-status-offline',
        issue: 'bg-status-issue/15 text-status-issue',
    };
    const dotMap = {
        online: 'bg-status-online',
        offline: 'bg-status-offline',
        issue: 'bg-status-issue',
    };
    return (
        <span
            className={clsx(
                'inline-flex items-center gap-1.5 px-2 py-1 rounded-md font-bold text-xs',
                colorMap[status],
            )}
        >
            <span className={clsx('w-1.5 h-1.5 rounded-full', dotMap[status])} aria-hidden="true" />
            {count > 999 ? `${(count / 1000).toFixed(1)}k` : count}
        </span>
    );
}

export function FloatingStatusCounter({ routerCounts, alertCount = 0, onAlertClick }) {
    const [collapsed, setCollapsed] = useState(() => {
        try {
            const stored = localStorage.getItem('map_counter_collapsed');
            if (stored !== null) return stored === 'true';
        } catch {
            // localStorage bisa disabled di incognito strict
        }
        // Default: expanded everywhere. Counter sekarang positioned
        // bottom-center di mobile (tidak konflik dengan MapStatusFilter
        // di top). Operator collapse manual kalau ganggu pan/zoom.
        return false;
    });

    const toggle = () => {
        const next = !collapsed;
        setCollapsed(next);
        try {
            localStorage.setItem('map_counter_collapsed', String(next));
        } catch {
            // localStorage bisa disabled di incognito strict
        }
    };

    const online = routerCounts?.online ?? 0;
    const offline = routerCounts?.offline ?? 0;
    const issue = routerCounts?.issue ?? 0;
    const total = online + offline + issue;

    return (
        <div
            role="status"
            aria-label="Router status counter"
            // Mobile (< 1024px): bottom-center supaya tidak konflik dengan
            //   header top (hamburger + brand + search) atau MapStatusFilter.
            //   bottom-4 = 16px gap dari bawah peta. Map container di
            //   AppLayout sudah pb-16 mobile untuk clear BottomNav, jadi
            //   bottom-4 here aman tidak ketutupi bottom nav.
            // Desktop (\xe2\x89\xa51024px): top-right (lg:top-4 lg:right-4).
            //   Override mobile bottom positioning via lg:bottom-auto.
            className="absolute bottom-4 left-1/2 -translate-x-1/2 lg:top-4 lg:right-4 lg:left-auto lg:bottom-auto lg:translate-x-0 z-[1000] bg-surface-darker/95 backdrop-blur-xl border border-slate-border rounded-xl shadow-2xl overflow-hidden"
            style={{ minWidth: collapsed ? '0' : '200px' }}
        >
            {/* Collapsed mode: cuma summary 1 baris kecil */}
            {collapsed ? (
                <button
                    type="button"
                    onClick={toggle}
                    className="flex items-center gap-2 px-3 py-2 hover:bg-white/5 transition-colors w-full"
                    aria-label="Expand status counter"
                    title="Klik untuk expand"
                >
                    <span className="w-1.5 h-1.5 rounded-full bg-status-online" aria-hidden="true" />
                    <span className="text-xs font-bold text-fg">{total}</span>
                    <ChevronDown className="w-3 h-3 text-fg-muted" aria-hidden="true" />
                </button>
            ) : (
                <>
                    {/* Header dengan toggle */}
                    <div className="flex items-center justify-between px-3 pt-2.5 pb-1.5">
                        <h3 className="text-[10px] font-bold uppercase tracking-widest text-fg-muted">
                            Router
                        </h3>
                        <button
                            type="button"
                            onClick={toggle}
                            className="p-0.5 text-fg-muted hover:text-fg transition-colors"
                            aria-label="Collapse status counter"
                            title="Klik untuk minimize"
                        >
                            <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>
                    </div>

                    {/* Router counts row */}
                    <div className="flex items-center gap-1.5 px-3 pb-2.5">
                        <StatusPill status="online" count={online} />
                        <StatusPill status="offline" count={offline} />
                        <StatusPill status="issue" count={issue} />
                    </div>

                    {/* Divider */}
                    <div className="h-px bg-slate-border" aria-hidden="true" />

                    {/* Alert row — kalau onAlertClick di-pass parent (NetworkMap),
                        jadi button buka AlertPanel quick view. Kalau tidak,
                        fallback Link ke /alerts page. */}
                    {onAlertClick ? (
                        <button
                            type="button"
                            onClick={onAlertClick}
                            className={clsx(
                                'flex items-center gap-2 px-3 py-2.5 transition-colors w-full text-left',
                                alertCount > 0
                                    ? 'text-status-offline hover:bg-status-offline/10'
                                    : 'text-fg-muted hover:bg-white/5',
                            )}
                            aria-label={`${alertCount} alert ${alertCount > 0 ? 'belum dibaca, klik untuk lihat' : 'tidak ada'}`}
                        >
                            <Bell className={clsx('w-4 h-4', alertCount > 0 && 'animate-pulse')} aria-hidden="true" />
                            <span className="text-xs font-bold flex-1">
                                {alertCount > 0 ? `${alertCount} Alert Unread` : 'Tidak ada alert'}
                            </span>
                        </button>
                    ) : (
                        <Link
                            to="/alerts"
                            className={clsx(
                                'flex items-center gap-2 px-3 py-2.5 transition-colors',
                                alertCount > 0
                                    ? 'text-status-offline hover:bg-status-offline/10'
                                    : 'text-fg-muted hover:bg-white/5',
                            )}
                            aria-label={`${alertCount} alert ${alertCount > 0 ? 'belum dibaca' : 'tidak ada'}`}
                        >
                            <Bell className={clsx('w-4 h-4', alertCount > 0 && 'animate-pulse')} aria-hidden="true" />
                            <span className="text-xs font-bold flex-1">
                                {alertCount > 0 ? `${alertCount} Alert Unread` : 'Tidak ada alert'}
                            </span>
                        </Link>
                    )}
                </>
            )}
        </div>
    );
}

export default FloatingStatusCounter;
