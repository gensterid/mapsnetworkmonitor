import React from 'react';
import clsx from 'clsx';

/**
 * MapStatusFilter — Floating chip filter di pojok kiri atas map.
 *
 * UI:
 *   [ All ] [ 🟢 Online ] [ 🔴 Offline ] [ 🟡 Issue ]
 *
 * Klik chip → state ke parent (NetworkMap.jsx) → marker filtered by status.
 * Default value: 'all'.
 *
 * Token warna dari src/constants/status.js (single source).
 */

const FILTERS = [
    { value: 'all', label: 'Semua', dotColor: null },
    { value: 'online', label: 'Online', dotColor: 'bg-status-online' },
    { value: 'offline', label: 'Offline', dotColor: 'bg-status-offline' },
    { value: 'issue', label: 'Issue', dotColor: 'bg-status-issue' },
];

const ACTIVE_CLASS = {
    all: 'bg-primary text-white ring-1 ring-primary/50',
    online: 'bg-status-online/20 text-status-online ring-1 ring-status-online/40',
    offline: 'bg-status-offline/20 text-status-offline ring-1 ring-status-offline/40',
    issue: 'bg-status-issue/20 text-status-issue ring-1 ring-status-issue/40',
};

export function MapStatusFilter({ value = 'all', onChange, counts }) {
    return (
        <div
            role="radiogroup"
            aria-label="Filter status marker"
            className="absolute top-4 left-4 z-[1000] flex items-center gap-1 bg-surface-darker/95 backdrop-blur-xl border border-slate-border rounded-xl shadow-2xl p-1"
        >
            {FILTERS.map((f) => {
                const isActive = value === f.value;
                const count =
                    f.value === 'all'
                        ? (counts?.online ?? 0) + (counts?.offline ?? 0) + (counts?.issue ?? 0)
                        : counts?.[f.value] ?? 0;

                return (
                    <button
                        key={f.value}
                        type="button"
                        role="radio"
                        aria-checked={isActive}
                        onClick={() => onChange(f.value)}
                        className={clsx(
                            'inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all',
                            isActive
                                ? ACTIVE_CLASS[f.value]
                                : 'text-fg-muted hover:text-fg hover:bg-white/5',
                        )}
                        title={`Tampilkan marker ${f.label.toLowerCase()}`}
                    >
                        {f.dotColor && (
                            <span className={clsx('w-1.5 h-1.5 rounded-full', f.dotColor)} aria-hidden="true" />
                        )}
                        <span>{f.label}</span>
                        {counts && (
                            <span
                                className={clsx(
                                    'text-[10px] font-bold px-1 py-0 rounded',
                                    isActive ? 'opacity-80' : 'opacity-60',
                                )}
                            >
                                {count > 999 ? `${(count / 1000).toFixed(1)}k` : count}
                            </span>
                        )}
                    </button>
                );
            })}
        </div>
    );
}

export default MapStatusFilter;
