import React from 'react';
import { useMikhmonContext } from '@/contexts/useMikhmonContext';
import { useMikhmonInfo, useMikhmonResource } from '@/hooks/useMikhmon';
import { MODE_DESCRIPTORS } from '@/components/mikhmon/ModeBadge';
import { Cpu, MemoryStick, Clock, Thermometer, Router as RouterIcon, AlertCircle } from 'lucide-react';
import clsx from 'clsx';

/**
 * MikHMON Dashboard — landing page.
 * Phase A1 shows router meta + a fuller system-resource card. Phase A5+
 * will add hotspot/PPP active counts and traffic charts here.
 */

function StatTile({ icon: Icon, label, value, hint, color = 'text-slate-200' }) {
    return (
        <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4">
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2">
                <Icon className="w-3.5 h-3.5" />
                {label}
            </div>
            <div className={clsx('text-2xl font-bold tabular-nums', color)}>{value}</div>
            {hint && <div className="text-xs text-slate-500 mt-1">{hint}</div>}
        </div>
    );
}

function fmtBytesMB(bytes) {
    if (bytes == null) return '—';
    return `${Math.round(bytes / (1024 * 1024))} MB`;
}

function cpuColor(load) {
    if (load == null) return 'text-slate-200';
    if (load < 40) return 'text-emerald-300';
    if (load < 75) return 'text-yellow-300';
    return 'text-red-300';
}

export default function Dashboard() {
    const { selectedRouterId } = useMikhmonContext();
    const info = useMikhmonInfo(selectedRouterId);
    const resource = useMikhmonResource(selectedRouterId);

    const r = resource.data || {};
    const mode = info.data?.hotspotMode || 'disabled';
    const desc = MODE_DESCRIPTORS[mode];

    return (
        <div className="space-y-6 max-w-6xl">
            {/* Header */}
            <div>
                <div className="flex items-center gap-3 flex-wrap">
                    <RouterIcon className="w-5 h-5 text-primary" />
                    <h1 className="text-xl font-bold text-slate-100">
                        {info.data?.router?.name || 'Memuat…'}
                    </h1>
                    {info.data?.router?.host && (
                        <span className="text-sm text-slate-400 font-mono">
                            {info.data.router.host}
                        </span>
                    )}
                </div>
                <p className="text-xs text-slate-500 mt-1">
                    MikHMON Console · pilih menu di sidebar untuk mulai operasi
                </p>
            </div>

            {/* Mode info card */}
            {desc && (
                <div className={clsx(
                    'rounded-xl border p-4 flex items-start gap-3',
                    desc.ring,
                )}>
                    <span className={clsx('w-2 h-2 rounded-full mt-1.5 shrink-0', desc.dot)} />
                    <div className="flex-1">
                        <div className={clsx('text-sm font-bold uppercase tracking-tight', desc.text)}>
                            Mode: {desc.label}
                        </div>
                        <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                            {desc.tooltip}
                        </p>
                    </div>
                </div>
            )}

            {/* System resource grid */}
            {resource.isError ? (
                <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 flex items-start gap-3 text-red-300 text-sm">
                    <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                    <div>
                        <div className="font-bold">Gagal ambil system resource</div>
                        <div className="text-xs opacity-80 mt-1">
                            {resource.error?.response?.data?.error || 'Cek koneksi MikroTik dan kredensial router.'}
                        </div>
                    </div>
                </div>
            ) : (
                <div>
                    <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
                        System Resource
                    </h2>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <StatTile
                            icon={Cpu}
                            label="CPU Load"
                            value={r.cpuLoad != null ? `${r.cpuLoad}%` : '—'}
                            hint={r.cpuCount ? `${r.cpuCount} core` : null}
                            color={cpuColor(r.cpuLoad)}
                        />
                        <StatTile
                            icon={MemoryStick}
                            label="RAM"
                            value={fmtBytesMB(r.usedMemory)}
                            hint={r.totalMemory ? `of ${fmtBytesMB(r.totalMemory)}` : null}
                        />
                        <StatTile
                            icon={Clock}
                            label="Uptime"
                            value={r.uptime || '—'}
                        />
                        <StatTile
                            icon={Thermometer}
                            label="Suhu Board"
                            value={r.boardTemp != null ? `${r.boardTemp}°C` : '—'}
                            color={r.boardTemp != null && r.boardTemp > 70 ? 'text-red-300' : 'text-slate-200'}
                        />
                    </div>
                </div>
            )}

            <div className="text-xs text-slate-600 italic">
                Module hotspot/PPP/queue/IP/system sedang disiapkan di phase berikutnya.
            </div>
        </div>
    );
}
