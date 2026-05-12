import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { get } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { RefreshCw, Activity, Database, AlertCircle, HardDrive, Server, Loader2 } from 'lucide-react';
import clsx from 'clsx';

const fmtPretty = (b) => {
    if (!b) return '0 B';
    const u = ['B','KB','MB','GB','TB'];
    let i = 0; let n = Number(b);
    while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
    return `${n.toFixed(1)} ${u[i]}`;
};

const Stat = ({ label, value, hint, tone = 'default' }) => (
    <div className={clsx(
        'rounded-lg border p-3',
        tone === 'warn' ? 'border-amber-500/30 bg-amber-500/5' :
        tone === 'bad' ? 'border-red-500/30 bg-red-500/5' :
        tone === 'good' ? 'border-emerald-500/30 bg-emerald-500/5' :
        'border-slate-800 bg-slate-900/40'
    )}>
        <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">{label}</div>
        <div className="text-xl font-bold text-white font-mono">{value}</div>
        {hint && <div className="text-[10px] text-slate-500 mt-0.5">{hint}</div>}
    </div>
);

export default function DiagnosticsSettings() {
    const { data, isLoading, isFetching, refetch, error } = useQuery({
        queryKey: ['diagnostics'],
        queryFn: () => get('/diagnostics'),
        refetchInterval: 30000,
        staleTime: 15000,
    });

    if (isLoading) {
        return <div className="flex items-center gap-2 text-slate-400 py-6"><Loader2 className="w-4 h-4 animate-spin" /> Loading diagnostics…</div>;
    }
    if (error) {
        return <div className="text-red-400 py-6">Failed to load: {error.message}</div>;
    }

    const d = data?.data || {};
    const fleet = d.fleet || {};
    const ifaces = d.interfaces || {};
    const nw = d.netwatch || {};
    const pppoe = d.pppoe || {};
    const onu = d.onu || {};
    const proc = d.process || {};
    const queue = d.queue || {};
    const alerts = d.alertsLast24h || [];
    const stale = d.staleRouters || [];
    const hotspots = d.interfaceHotspots || [];
    const dbSize = d.dbSize || [];

    const offlineCount = fleet.offline ?? 0;
    const maxIfaces = ifaces.max_interfaces ?? 0;
    const queueWaiting = queue.waiting ?? 0;
    const heapPct = proc.heapTotalMB ? Math.round((proc.heapUsedMB / proc.heapTotalMB) * 100) : 0;

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                        <Activity className="w-5 h-5" /> System Diagnostics
                    </h3>
                    <p className="text-xs text-slate-500">Auto-refresh tiap 30 detik · last update {d.collectedAt ? new Date(d.collectedAt).toLocaleTimeString() : '—'}</p>
                </div>
                <Button onClick={() => refetch()} variant="outline" size="sm" disabled={isFetching}>
                    <RefreshCw className={clsx('w-4 h-4 mr-2', isFetching && 'animate-spin')} />
                    Refresh
                </Button>
            </div>

            {/* Fleet overview */}
            <Card>
                <CardHeader><CardTitle className="text-sm">Fleet Overview</CardTitle></CardHeader>
                <CardContent className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                    <Stat label="Total Router" value={fleet.total ?? 0} />
                    <Stat label="Online" value={fleet.online ?? 0} tone="good" />
                    <Stat label="Offline" value={offlineCount} tone={offlineCount > 0 ? 'bad' : 'default'} />
                    <Stat label="Tenants" value={fleet.tenants ?? 0} />
                    <Stat label="SNMP" value={fleet.snmp_enabled ?? 0} hint="routers polling SNMP" />
                    <Stat label="GenieACS" value={fleet.genieacs_enabled ?? 0} hint="routers w/ ACS" />
                </CardContent>
            </Card>

            {/* Polling load */}
            <Card>
                <CardHeader><CardTitle className="text-sm">Polling Load</CardTitle></CardHeader>
                <CardContent className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <Stat label="Total Interfaces" value={ifaces.total_interfaces ?? 0} hint={`avg ${ifaces.avg_interfaces ?? 0}/router`} />
                    <Stat label="Max Interfaces" value={maxIfaces} hint={maxIfaces > 100 ? 'hotspot detected' : 'normal'} tone={maxIfaces > 100 ? 'warn' : 'default'} />
                    <Stat label="Netwatch Entries" value={nw.total_entries ?? 0} hint={`max ${nw.max_per_router ?? 0}/router`} />
                    <Stat label="PPPoE Active" value={pppoe.total_sessions ?? 0} hint={`${pppoe.routers_with_pppoe ?? 0} routers`} />
                </CardContent>
            </Card>

            {/* ONU + Queue */}
            <Card>
                <CardHeader><CardTitle className="text-sm">ONU & Queue</CardTitle></CardHeader>
                <CardContent className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <Stat label="ONU Total" value={onu.total_onus ?? 0} hint={`${onu.online ?? 0} online · ${onu.olts ?? 0} OLTs`} />
                    <Stat label="Queue Waiting" value={queueWaiting} tone={queueWaiting > 50 ? 'warn' : 'default'} />
                    <Stat label="Queue Active" value={queue.active ?? 0} />
                    <Stat label="Queue Failed" value={queue.failed ?? 0} tone={(queue.failed ?? 0) > 5 ? 'warn' : 'default'} />
                </CardContent>
            </Card>

            {/* Process */}
            <Card>
                <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Server className="w-4 h-4" /> API Process</CardTitle></CardHeader>
                <CardContent className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <Stat label="RSS Memory" value={`${proc.rssMB ?? 0} MB`} />
                    <Stat label="Heap Used" value={`${proc.heapUsedMB ?? 0} MB`} hint={`${heapPct}% of ${proc.heapTotalMB ?? 0} MB`} tone={heapPct > 80 ? 'warn' : 'default'} />
                    <Stat label="Uptime" value={`${Math.round((proc.uptimeSec ?? 0) / 60)} min`} />
                    <Stat label="Total Iface Poll" value={ifaces.total_interfaces ?? 0} hint="per cycle" />
                </CardContent>
            </Card>

            {/* Stale routers */}
            {stale.length > 0 && (
                <Card>
                    <CardHeader><CardTitle className="text-sm flex items-center gap-2 text-amber-400"><AlertCircle className="w-4 h-4" /> Routers Lacking Recent Metrics</CardTitle></CardHeader>
                    <CardContent>
                        <div className="text-xs text-slate-500 mb-2">Tidak ada metrics masuk dalam 10 menit terakhir. Cek koneksi atau credential.</div>
                        <div className="space-y-1.5">
                            {stale.map((r, i) => (
                                <div key={i} className="flex items-center justify-between text-xs bg-slate-900/40 rounded px-3 py-2 border border-slate-800">
                                    <div className="min-w-0">
                                        <span className="font-semibold text-white">{r.name}</span>
                                        <span className="text-slate-500 ml-2 font-mono">{r.host}</span>
                                    </div>
                                    <div className="text-right shrink-0">
                                        <div className={clsx('font-mono', r.minutes_since_last_metric > 60 ? 'text-red-400' : 'text-amber-400')}>
                                            {r.minutes_since_last_metric ? `${Math.round(r.minutes_since_last_metric)}m` : 'never'}
                                        </div>
                                        {r.last_error && <div className="text-[10px] text-red-400/70 truncate max-w-[200px]" title={r.last_error}>{r.last_error}</div>}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Interface hotspots */}
            <Card>
                <CardHeader><CardTitle className="text-sm">Top Interface Counts</CardTitle></CardHeader>
                <CardContent>
                    <div className="space-y-1">
                        {hotspots.map((r, i) => (
                            <div key={i} className="flex items-center justify-between text-xs">
                                <span className="text-slate-300">{r.name} <span className="text-slate-500 font-mono ml-2">{r.host}</span></span>
                                <span className="font-mono text-white font-bold">{r.interface_count}</span>
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>

            {/* Alerts last 24h */}
            <Card>
                <CardHeader><CardTitle className="text-sm">Alert Volume (24h)</CardTitle></CardHeader>
                <CardContent>
                    {alerts.length === 0 ? (
                        <div className="text-xs text-slate-500">No alerts in last 24h.</div>
                    ) : (
                        <div className="space-y-1">
                            {alerts.map((a, i) => (
                                <div key={i} className="flex items-center justify-between text-xs">
                                    <span className="text-slate-300">{a.type}</span>
                                    <span className="font-mono">
                                        <span className="text-white">{a.count}</span>
                                        {a.unresolved > 0 && <span className="text-amber-400 ml-2">({a.unresolved} unresolved)</span>}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* DB size */}
            <Card>
                <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Database className="w-4 h-4" /> Largest Tables</CardTitle></CardHeader>
                <CardContent>
                    <div className="space-y-1">
                        {dbSize.map((t, i) => (
                            <div key={i} className="flex items-center justify-between text-xs">
                                <span className="text-slate-400 font-mono">{t.table_name}</span>
                                <span className="font-mono text-white">{t.pretty}</span>
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
