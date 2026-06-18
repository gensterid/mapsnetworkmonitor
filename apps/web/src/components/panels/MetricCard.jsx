import React from 'react';
import clsx from 'clsx';

/**
 * MetricCard — Shared card untuk display metric di RouterDetailPanel +
 * NetwatchDetailPanel. Diekstrak per code-review M4 (DRY) supaya color
 * scheme + sizing konsisten di semua panel.
 *
 * Props:
 *   label: string                — uppercase tracking-wider header
 *   value: string | number       — main metric value (large)
 *   sub?: string                 — small subtitle below value (optional)
 *   icon: React.ComponentType    — Lucide icon
 *   accent?: 'primary' | 'online' | 'offline' | 'issue' | 'unknown'
 *                                — color theme. Default 'primary'.
 */

const COLOR_MAP = {
    primary: 'text-primary bg-primary/10',
    online: 'text-status-online bg-status-online/10',
    offline: 'text-status-offline bg-status-offline/10',
    issue: 'text-status-issue bg-status-issue/10',
    unknown: 'text-status-unknown bg-status-unknown/10',
};

export function MetricCard({ label, value, sub, icon: Icon, accent = 'primary' }) {
    const colorClass = COLOR_MAP[accent] || COLOR_MAP.primary;
    return (
        <div className="bg-surface-darker/50 border border-slate-border/60 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1.5">
                <div className={clsx('w-6 h-6 rounded flex items-center justify-center', colorClass)}>
                    <Icon className="w-3.5 h-3.5" aria-hidden="true" />
                </div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-fg-muted">{label}</span>
            </div>
            <div className="text-xl font-bold text-fg">{value}</div>
            {sub && <div className="text-xs text-fg-muted mt-0.5">{sub}</div>}
        </div>
    );
}

export default MetricCard;
