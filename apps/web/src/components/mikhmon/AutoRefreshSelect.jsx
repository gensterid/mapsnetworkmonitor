import React from 'react';
import { useMikhmonContext } from '@/contexts/useMikhmonContext';
import { REFRESH_OPTIONS } from '@/contexts/mikhmonConstants';
import { RefreshCw, Pause } from 'lucide-react';
import clsx from 'clsx';

/**
 * Top-bar control for the global auto-refresh interval. Polling pauses
 * while the tab is hidden — the icon switches to a pause glyph so it's
 * obvious to operators glancing at the bar.
 */
export default function AutoRefreshSelect({ className }) {
    const { autoRefreshMs, setAutoRefreshMs, tabVisible } = useMikhmonContext();

    const handleChange = (e) => {
        const v = e.target.value;
        setAutoRefreshMs(v === 'null' ? null : parseInt(v, 10));
    };

    const Icon = !tabVisible ? Pause : RefreshCw;
    const iconColor = !tabVisible
        ? 'text-amber-400'
        : autoRefreshMs === null
            ? 'text-slate-500'
            : 'text-emerald-400';

    return (
        <div className={clsx('flex items-center gap-2', className)}>
            <Icon className={clsx('w-4 h-4 shrink-0', iconColor)} />
            <select
                value={autoRefreshMs === null ? 'null' : String(autoRefreshMs)}
                onChange={handleChange}
                title={!tabVisible ? 'Polling dijeda karena tab tidak aktif' : 'Interval auto-refresh'}
                className="bg-slate-900/60 border border-slate-700/50 text-slate-200 text-xs font-medium rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
                {REFRESH_OPTIONS.map((opt) => (
                    <option key={String(opt.value)} value={opt.value === null ? 'null' : String(opt.value)}>
                        {opt.label}
                    </option>
                ))}
            </select>
        </div>
    );
}
