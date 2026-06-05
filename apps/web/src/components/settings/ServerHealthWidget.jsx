import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { get } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { HardDrive, Archive, AlertTriangle, CheckCircle2, XCircle, Loader2, Terminal, Copy } from 'lucide-react';
import clsx from 'clsx';
import toast from 'react-hot-toast';

/**
 * Server Health — superadmin-only widget added to the Diagnostics page
 * after the 2026-06-05 incident (disk full → PG crashed → API
 * crash-looped). Surfaces two warning signals:
 *
 *  1. Disk usage on the root filesystem (where /opt/app + PG data
 *     live). Threshold-colored to grab attention before 95%.
 *  2. pm2-logrotate module status + current config. Without it, pm2
 *     logs are uncapped and can eat dozens of GB over weeks. The
 *     widget links the operator to the exact install + apply
 *     commands so the fix is one copy-paste away.
 *
 * Both endpoints are gated by requireRole('superadmin') at the route
 * level — this widget is mounted unconditionally because non-
 * superadmins won't reach the Diagnostics page anyway (it's a Settings
 * sub-tab they don't see).
 */

function fmtBytes(n) {
    const v = parseInt(n || 0);
    if (!v) return '—';
    if (v < 1024) return `${v} B`;
    if (v < 1024 * 1024) return `${(v / 1024).toFixed(1)} KB`;
    if (v < 1024 * 1024 * 1024) return `${(v / (1024 * 1024)).toFixed(1)} MB`;
    if (v < 1024 * 1024 * 1024 * 1024) return `${(v / (1024 * 1024 * 1024)).toFixed(2)} GB`;
    return `${(v / (1024 * 1024 * 1024 * 1024)).toFixed(2)} TB`;
}

function copy(text) {
    if (!text) return;
    if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(text).then(
            () => toast.success('Disalin'),
            () => toast.error('Gagal salin'),
        );
    }
}

// ─────────────────────────────────────────────────────────────────────────
// Disk Section
// ─────────────────────────────────────────────────────────────────────────

function DiskSection() {
    const { data, isLoading, error, refetch } = useQuery({
        queryKey: ['diagnostics', 'server-disk'],
        queryFn: () => get('/diagnostics/server-disk'),
        refetchInterval: 60_000,
        staleTime: 30_000,
    });

    if (isLoading) {
        return (
            <div className="flex items-center gap-2 text-slate-500 text-xs py-3">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Mengukur disk…
            </div>
        );
    }
    if (error || !data?.ok) {
        return (
            <div className="text-xs text-amber-300 py-2">
                Gagal baca disk: {data?.error || error?.message || 'unknown'}
            </div>
        );
    }

    const d = data.data || {};
    const sev = d.severity || 'ok';
    const pct = d.usePct ?? 0;
    const barColor = sev === 'critical' ? 'bg-red-500' : sev === 'warn' ? 'bg-amber-500' : 'bg-emerald-500';
    const sevTextColor = sev === 'critical' ? 'text-red-300' : sev === 'warn' ? 'text-amber-300' : 'text-emerald-300';

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-baseline gap-2">
                    <span className={clsx('text-2xl font-bold tabular-nums', sevTextColor)}>{pct}%</span>
                    <span className="text-xs text-slate-500">terpakai</span>
                </div>
                <div className="text-xs text-slate-400 font-mono">
                    {fmtBytes(d.usedBytes)} / {fmtBytes(d.totalBytes)} · sisa <span className={sevTextColor}>{fmtBytes(d.availableBytes)}</span>
                </div>
            </div>

            <div className="w-full h-2.5 rounded-full bg-slate-800 overflow-hidden">
                <div className={clsx('h-full transition-all duration-500', barColor)} style={{ width: `${Math.min(100, pct)}%` }} />
            </div>

            <div className="flex items-center justify-between text-[10px] text-slate-500">
                <span>{d.filesystem || '—'} ({d.type || 'unknown'}) → {d.mountedOn || '/'}</span>
                <button onClick={() => refetch()} className="hover:text-slate-300">Refresh</button>
            </div>

            {sev !== 'ok' && (
                <div className={clsx(
                    'text-xs rounded-lg border p-3 leading-relaxed',
                    sev === 'critical' ? 'bg-red-500/10 border-red-500/30 text-red-200' : 'bg-amber-500/10 border-amber-500/30 text-amber-200',
                )}>
                    <div className="font-bold mb-1 flex items-center gap-1.5">
                        {sev === 'critical' ? <XCircle className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
                        {sev === 'critical' ? 'DISK NYARIS PENUH' : 'DISK PERLU PERHATIAN'}
                    </div>
                    <p className="text-slate-300 text-[11px]">
                        Disk &gt;{sev === 'critical' ? '95' : '85'}% bisa menyebabkan PostgreSQL refuse write dan Redis stop snapshot (incident 5 Jun 2026).
                        Bersihkan log lama atau backup yang sudah didownload.
                    </p>
                    <div className="mt-2 grid grid-cols-1 gap-1 font-mono text-[10px] text-slate-400">
                        <div className="flex items-center gap-1">
                            <span className="text-slate-500">$</span> pm2 flush
                            <button onClick={() => copy('pm2 flush')} className="ml-auto p-0.5 hover:text-slate-200"><Copy className="w-3 h-3" /></button>
                        </div>
                        <div className="flex items-center gap-1">
                            <span className="text-slate-500">$</span> sudo journalctl --vacuum-size=200M
                            <button onClick={() => copy('sudo journalctl --vacuum-size=200M')} className="ml-auto p-0.5 hover:text-slate-200"><Copy className="w-3 h-3" /></button>
                        </div>
                        <div className="flex items-center gap-1">
                            <span className="text-slate-500">$</span> sudo find / -type f -size +100M 2&gt;/dev/null
                            <button onClick={() => copy('sudo find / -type f -size +100M 2>/dev/null')} className="ml-auto p-0.5 hover:text-slate-200"><Copy className="w-3 h-3" /></button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────
// PM2 Logrotate Section
// ─────────────────────────────────────────────────────────────────────────

function LogrotateSection() {
    const { data, isLoading, error, refetch } = useQuery({
        queryKey: ['diagnostics', 'pm2-logrotate'],
        queryFn: () => get('/diagnostics/pm2-logrotate'),
        refetchInterval: 5 * 60_000,
        staleTime: 60_000,
    });

    if (isLoading) {
        return (
            <div className="flex items-center gap-2 text-slate-500 text-xs py-3">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Mengecek pm2-logrotate…
            </div>
        );
    }
    if (error) {
        return (
            <div className="text-xs text-amber-300 py-2">
                Gagal cek pm2-logrotate: {error.message}
            </div>
        );
    }

    const installed = !!data?.installed;
    const status = data?.status;
    const config = data?.config || {};
    const recommended = data?.recommended || {};

    // Deviation check: highlight config keys that don't match recommended
    const flagged = Object.keys(recommended).filter((k) => {
        const cur = config[k];
        if (cur === undefined || cur === null) return true;
        return String(cur).trim() !== String(recommended[k]).trim();
    });

    if (!installed) {
        return (
            <div className="space-y-2">
                <div className="flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/30 px-3 py-2">
                    <XCircle className="w-4 h-4 text-red-300 shrink-0" />
                    <div className="flex-1 min-w-0">
                        <div className="text-sm font-bold text-red-200">pm2-logrotate BELUM TERPASANG</div>
                        <p className="text-[11px] text-slate-300 mt-0.5">
                            Tanpa logrotate, file log pm2 bisa tumbuh tanpa batas (GB-an). Install sekali pakai command di bawah.
                        </p>
                    </div>
                </div>
                <CommandBlock
                    title="Install + apply config recommended"
                    commands={[
                        data?.installCommand || 'pm2 install pm2-logrotate',
                        ...(data?.applyCommands || []),
                    ]}
                />
            </div>
        );
    }

    return (
        <div className="space-y-3">
            <div className={clsx(
                'flex items-center gap-2 rounded-lg border px-3 py-2',
                status === 'online'
                    ? 'bg-emerald-500/10 border-emerald-500/30'
                    : 'bg-amber-500/10 border-amber-500/30',
            )}>
                {status === 'online'
                    ? <CheckCircle2 className="w-4 h-4 text-emerald-300 shrink-0" />
                    : <AlertTriangle className="w-4 h-4 text-amber-300 shrink-0" />
                }
                <div className="flex-1 min-w-0">
                    <div className={clsx('text-sm font-bold', status === 'online' ? 'text-emerald-200' : 'text-amber-200')}>
                        pm2-logrotate terpasang {status ? `(${status})` : ''}
                    </div>
                </div>
                <button onClick={() => refetch()} className="text-[10px] text-slate-400 hover:text-slate-200">Refresh</button>
            </div>

            <div className="rounded-lg border border-slate-800 bg-slate-900/40 overflow-hidden">
                <div className="px-3 py-2 border-b border-slate-800 text-[10px] uppercase tracking-wider text-slate-500 font-bold">
                    Konfigurasi saat ini
                </div>
                <div className="divide-y divide-slate-800/40">
                    {Object.keys({ ...recommended, ...config }).map((k) => {
                        const cur = config[k];
                        const rec = recommended[k];
                        const isFlagged = flagged.includes(k);
                        return (
                            <div key={k} className="px-3 py-1.5 flex items-center justify-between gap-3 text-xs">
                                <span className={clsx('font-mono', isFlagged ? 'text-amber-300' : 'text-slate-400')}>{k}</span>
                                <span className="flex items-center gap-2 font-mono">
                                    <span className={isFlagged ? 'text-amber-300' : 'text-slate-200'}>{cur ?? <span className="text-slate-600 italic">unset</span>}</span>
                                    {rec && (
                                        <span className="text-[10px] text-slate-500">
                                            (rec: {rec})
                                        </span>
                                    )}
                                </span>
                            </div>
                        );
                    })}
                </div>
            </div>

            {flagged.length > 0 && (
                <CommandBlock
                    title={`${flagged.length} setting belum optimal — jalankan untuk apply recommended`}
                    commands={data?.applyCommands || []}
                />
            )}
        </div>
    );
}

function CommandBlock({ title, commands }) {
    return (
        <div className="rounded-lg border border-slate-700/50 bg-slate-950/50 overflow-hidden">
            <div className="px-3 py-1.5 border-b border-slate-800 text-[10px] uppercase tracking-wider text-slate-500 font-bold flex items-center gap-1.5">
                <Terminal className="w-3 h-3" />
                {title}
            </div>
            <div className="p-2 space-y-1">
                {commands.map((c, i) => (
                    <div key={i} className="flex items-center gap-2 font-mono text-[11px] text-slate-300 group">
                        <span className="text-slate-600">$</span>
                        <span className="flex-1 truncate" title={c}>{c}</span>
                        <button
                            onClick={() => copy(c)}
                            className="p-1 rounded text-slate-500 hover:text-slate-200 hover:bg-white/5 opacity-60 group-hover:opacity-100"
                            title="Copy"
                        >
                            <Copy className="w-3 h-3" />
                        </button>
                    </div>
                ))}
                {commands.length > 1 && (
                    <button
                        onClick={() => copy(commands.join(' && '))}
                        className="w-full text-[10px] text-cyan-400 hover:text-cyan-300 pt-1 border-t border-slate-800"
                    >
                        Copy semua sebagai 1 baris (chained)
                    </button>
                )}
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────
// Main widget
// ─────────────────────────────────────────────────────────────────────────

export default function ServerHealthWidget() {
    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <Card>
                <CardHeader>
                    <CardTitle className="text-sm flex items-center gap-2">
                        <HardDrive className="w-4 h-4" />
                        Server Disk
                    </CardTitle>
                    <p className="text-[11px] text-slate-500 mt-1">
                        Disk &gt;85% memicu PG/Redis crash (incident 5 Jun 2026). Auto-refresh 60s.
                    </p>
                </CardHeader>
                <CardContent>
                    <DiskSection />
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle className="text-sm flex items-center gap-2">
                        <Archive className="w-4 h-4" />
                        PM2 Log Rotation
                    </CardTitle>
                    <p className="text-[11px] text-slate-500 mt-1">
                        Tanpa pm2-logrotate, log API tumbuh tanpa batas dan memakan disk.
                    </p>
                </CardHeader>
                <CardContent>
                    <LogrotateSection />
                </CardContent>
            </Card>
        </div>
    );
}
