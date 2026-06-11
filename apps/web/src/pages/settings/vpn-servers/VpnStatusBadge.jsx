import React from 'react';
import clsx from 'clsx';
import { Wifi, WifiOff, Loader2, AlertCircle, Power } from 'lucide-react';

const STATUS_MAP = {
    connected: {
        label: 'Connected',
        icon: Wifi,
        cls: 'bg-success/10 text-success border-success/20',
    },
    connecting: {
        label: 'Connecting',
        icon: Loader2,
        cls: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
        spin: true,
    },
    disconnected: {
        label: 'Disconnected',
        icon: WifiOff,
        cls: 'bg-warning/10 text-warning border-warning/20',
    },
    error: {
        label: 'Error',
        icon: AlertCircle,
        cls: 'bg-danger/10 text-danger border-danger/20',
    },
    disabled: {
        label: 'Disabled',
        icon: Power,
        cls: 'bg-slate-surface text-fg-muted border-slate-border',
    },
};

export function VpnStatusBadge({ status, size = 'sm' }) {
    const cfg = STATUS_MAP[status] || STATUS_MAP.disabled;
    const Icon = cfg.icon;

    const sizeCls = size === 'lg'
        ? 'px-3 py-1.5 text-sm'
        : 'px-2 py-0.5 text-xs';
    const iconSize = size === 'lg' ? 'w-4 h-4' : 'w-3 h-3';

    return (
        <span
            className={clsx(
                'inline-flex items-center gap-1.5 font-bold uppercase tracking-wider border rounded-full',
                sizeCls,
                cfg.cls
            )}
        >
            <Icon className={clsx(iconSize, cfg.spin && 'animate-spin')} />
            {cfg.label}
        </span>
    );
}
