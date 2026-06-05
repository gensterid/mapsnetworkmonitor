import React from 'react';
import { Link } from 'react-router-dom';
import { useMikhmonInfo } from '@/hooks/useMikhmon';
import { useMikhmonContext } from '@/contexts/useMikhmonContext';
import clsx from 'clsx';

/**
 * Hotspot-mode indicator shown in the MikHMON shell top bar. Visual contract:
 *  - 🔵 Billing App     (native)         — voucher di sini TERPISAH dari Billing
 *  - 🟢 MikHMON Bridge  (mikhmon_bridge) — voucher di sini otomatis ter-track Billing
 *  - ⚫ Hotspot Disabled (disabled)       — tab voucher/hotspot hidden
 *
 * Clicking the badge jumps to the Billing → Pengaturan Router tab so
 * operators can change the mode without leaving the flow.
 */

const MODE_DESCRIPTORS = {
    native: {
        label: 'Billing App',
        dot: 'bg-blue-400 shadow-[0_0_6px_rgba(96,165,250,0.55)]',
        text: 'text-blue-300',
        ring: 'border-blue-500/30 bg-blue-500/10',
        tooltip:
            'Router pakai Billing app untuk voucher & subscription. Voucher yang Anda generate di MikHMON shell ini akan TERPISAH dari Billing.',
    },
    mikhmon_bridge: {
        label: 'MikHMON Bridge',
        dot: 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.55)]',
        text: 'text-emerald-300',
        ring: 'border-emerald-500/30 bg-emerald-500/10',
        tooltip:
            'Router pakai MikHMON. Voucher yang Anda generate di sini otomatis ter-track di Billing via comment parser.',
    },
    disabled: {
        label: 'Hotspot Disabled',
        dot: 'bg-slate-500',
        text: 'text-slate-400',
        ring: 'border-slate-700/40 bg-slate-800/30',
        tooltip:
            'Hotspot module di-disable untuk router ini. Tab voucher & hotspot tidak tersedia.',
    },
};

export default function ModeBadge({ className }) {
    const { selectedRouterId } = useMikhmonContext();
    const { data, isLoading } = useMikhmonInfo(selectedRouterId);

    if (!selectedRouterId) return null;

    if (isLoading || !data) {
        return (
            <div className={clsx(
                'inline-flex items-center gap-2 px-2.5 py-1 rounded-lg border border-slate-700/40 bg-slate-800/30 text-[11px] font-bold text-slate-500',
                className,
            )}>
                <span className="w-1.5 h-1.5 rounded-full bg-slate-600 animate-pulse" />
                Mode…
            </div>
        );
    }

    const mode = data.hotspotMode || 'disabled';
    const d = MODE_DESCRIPTORS[mode] || MODE_DESCRIPTORS.disabled;

    return (
        <Link
            to="/billing?tab=settings"
            title={d.tooltip}
            className={clsx(
                'inline-flex items-center gap-2 px-2.5 py-1 rounded-lg border text-[11px] font-bold uppercase tracking-tight transition-colors hover:brightness-125',
                d.ring,
                d.text,
                className,
            )}
        >
            <span className={clsx('w-1.5 h-1.5 rounded-full shrink-0', d.dot)} />
            {d.label}
        </Link>
    );
}

export { MODE_DESCRIPTORS };
