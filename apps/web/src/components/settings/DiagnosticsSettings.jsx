import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { get, post } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import {
    RefreshCw, Activity, Database, AlertCircle, Server, Loader2,
    CheckCircle2, AlertTriangle, XCircle, Info as InfoIcon,
    Zap, Brush, Wand2, Wrench,
} from 'lucide-react';
import clsx from 'clsx';
import toast from 'react-hot-toast';

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

const SEVERITY_META = {
    ok: { icon: CheckCircle2, color: 'text-emerald-400', bg: 'bg-emerald-500/5 border-emerald-500/20', label: 'OK' },
    info: { icon: InfoIcon, color: 'text-blue-400', bg: 'bg-blue-500/5 border-blue-500/20', label: 'INFO' },
    warn: { icon: AlertTriangle, color: 'text-amber-400', bg: 'bg-amber-500/5 border-amber-500/20', label: 'WARN' },
    critical: { icon: XCircle, color: 'text-red-400', bg: 'bg-red-500/5 border-red-500/20', label: 'CRITICAL' },
};

function HealthCheckRow({ check }) {
    const meta = SEVERITY_META[check.severity] || SEVERITY_META.ok;
    const Icon = meta.icon;
    return (
        <div className={clsx('rounded-lg border px-3 py-2 flex items-start gap-3', meta.bg)}>
            <Icon className={clsx('w-4 h-4 shrink-0 mt-0.5', meta.color)} />
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-white">{check.title}</span>
                    <span className={clsx('text-[9px] font-bold uppercase px-1.5 py-0.5 rounded', meta.color, meta.bg.split(' ')[0])}>{meta.label}</span>
                </div>
                <div className="text-xs text-slate-300 mt-0.5">{check.detail}</div>
                {check.action && <div className="text-[11px] text-amber-300/80 mt-1 italic">→ {check.action}</div>}
            </div>
        </div>
    );
}

export default function DiagnosticsSettings() {
    const qc = useQueryClient();
    const { data, isLoading, isFetching, refetch, error } = useQuery({
        queryKey: ['diagnostics'],
        queryFn: () => get('/diagnostics'),
        refetchInterval: 30000,
        staleTime: 15000,
    });

    const pruneRetentionMut = useMutation({
        mutationFn: () => post('/diagnostics/actions/prune-retention', { days: 30 }),
        onSuccess: (r) => {
            const d = r || {};
            toast.success(`Prune OK: ${d.bandwidthDeleted ?? 0} bw, ${d.metricsDeleted ?? 0} metrics, ${d.resolvedAlertsDeleted ?? 0} alerts deleted`);
            qc.invalidateQueries({ queryKey: ['diagnostics'] });
        },
        onError: (e) => toast.error(`Prune failed: ${e.message}`),
    });
    const clearBreakersMut = useMutation({
        mutationFn: () => post('/diagnostics/actions/clear-breakers'),
        onSuccess: (r) => {
            const d = r || {};
            toast.success(`Cleared ${d.breakersCleared ?? 0} breakers + ${d.backoffsCleared ?? 0} back-offs`);
            qc.invalidateQueries({ queryKey: ['diagnostics'] });
        },
        onError: (e) => toast.error(`Clear failed: ${e.message}`),
    });
    const sweepAlertsMut = useMutation({
        mutationFn: () => post('/diagnostics/actions/sweep-alerts'),
        onSuccess: (r) => {
            const n = r?.resolved ?? 0;
            toast.success(`Sweep OK: ${n} stale alert resolved`);
            qc.invalidateQueries({ queryKey: ['diagnostics'] });
        },
        onError: (e) => toast.error(`Sweep failed: ${e.message}`),
    });
    const vacuumMut = useMutation({
        mutationFn: (table) => post('/diagnostics/actions/vacuum-analyze', { table }),
        onSuccess: (r) => toast.success(`VACUUM ANALYZE ${r?.table} OK`),
        onError: (e) => toast.error(`Vacuum failed: ${e.message}`),
    });

    if (isLoading) {
        return <div className="flex items-center gap-2 text-slate-400 py-6"><Loader2 className="w-4 h-4 animate-spin" /> Loading diagnostics…</div>;
    }
    if (error) {
        return <div className="text-red-400 py-6">Failed to load: {error.message}</div>;
    }

    const d = data || {};
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
    const routerHealth = d.routerHealth || { breakers: [], backoffs: [] };
    const checks = d.healthChecks || [];
    const features = d.features || [];
    const verdict = d.verdict || { severity: 'ok', counts: { ok: 0, info: 0, warn: 0, critical: 0 } };

    const offlineCount = fleet.offline ?? 0;
    const maxIfaces = ifaces.max_interfaces ?? 0;
    const queueWaiting = queue.waiting ?? 0;
    const heapPct = proc.heapTotalMB ? Math.round((proc.heapUsedMB / proc.heapTotalMB) * 100) : 0;

    const verdictMeta = SEVERITY_META[verdict.severity] || SEVERITY_META.ok;
    const VerdictIcon = verdictMeta.icon;
    const verdictLabel = verdict.severity === 'ok' ? 'Sistem Sehat' : verdict.severity === 'info' ? 'Berjalan Normal' : verdict.severity === 'warn' ? 'Perlu Perhatian' : 'Tindakan Mendesak';

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                    <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                        <Activity className="w-5 h-5" /> System Diagnostics
                    </h3>
                    <p className="text-xs text-slate-500">Auto-refresh 30 detik · update {d.collectedAt ? new Date(d.collectedAt).toLocaleTimeString() : '—'}</p>
                </div>
                <Button onClick={() => refetch()} variant="outline" size="sm" disabled={isFetching}>
                    <RefreshCw className={clsx('w-4 h-4 mr-2', isFetching && 'animate-spin')} />
                    Refresh
                </Button>
            </div>

            {/* Verdict Card */}
            <Card className={verdictMeta.bg}>
                <CardContent className="p-4 sm:p-5 flex items-center gap-4">
                    <VerdictIcon className={clsx('w-10 h-10 sm:w-12 sm:h-12 shrink-0', verdictMeta.color)} />
                    <div className="min-w-0 flex-1">
                        <div className={clsx('text-lg sm:text-xl font-bold', verdictMeta.color)}>{verdictLabel}</div>
                        <div className="text-xs sm:text-sm text-slate-300 mt-1">
                            {verdict.counts.ok} ok · {verdict.counts.info} info · {verdict.counts.warn} warn · {verdict.counts.critical} critical
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Health Checks */}
            <Card>
                <CardHeader><CardTitle className="text-sm">Health Checks & Recommendations</CardTitle></CardHeader>
                <CardContent className="space-y-1.5">
                    {checks.map((c) => <HealthCheckRow key={c.id} check={c} />)}
                </CardContent>
            </Card>

            {/* Quick Actions */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-sm flex items-center gap-2"><Wrench className="w-4 h-4" /> Maintenance Actions</CardTitle>
                    <p className="text-[11px] text-slate-500 mt-1">Klik tombol sesuai gejala di Health Checks di atas. Aksi aman dan bisa diulang kapan saja.</p>
                </CardHeader>
                <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <div className="flex flex-col gap-1.5">
                        <Button
                            onClick={() => pruneRetentionMut.mutate()}
                            loading={pruneRetentionMut.isPending}
                            variant="outline"
                            size="sm"
                            className="justify-start"
                            title="Pangkas data lama (>30 hari) dari bandwidth_history, router_metrics, dan resolved alerts. Aman dijalankan kapan saja."
                        >
                            <Brush className="w-4 h-4 mr-2" /> Prune Retention (30d)
                        </Button>
                        <div className="text-[10px] text-slate-500 leading-snug px-1">
                            <span className="text-amber-300/80 font-semibold">Jika:</span> "Database Size" warning, atau DB tumbuh cepat.
                            <br/>
                            <span className="text-slate-400">Efek:</span> hapus data &gt;30 hari, kosongkan ruang disk.
                        </div>
                    </div>

                    <div className="flex flex-col gap-1.5">
                        <Button
                            onClick={() => clearBreakersMut.mutate()}
                            loading={clearBreakersMut.isPending}
                            variant="outline"
                            size="sm"
                            className="justify-start"
                            title="Reset state circuit-breaker + adaptive back-off untuk semua router. Polling normal lagi langsung."
                        >
                            <Zap className="w-4 h-4 mr-2" /> Clear Breakers & Back-offs
                        </Button>
                        <div className="text-[10px] text-slate-500 leading-snug px-1">
                            <span className="text-amber-300/80 font-semibold">Jika:</span> "Circuit Breaker Open" muncul, atau setelah perbaiki router yang sebelumnya bermasalah.
                            <br/>
                            <span className="text-slate-400">Efek:</span> router yang skip polling akan dicoba lagi sekarang.
                        </div>
                    </div>

                    <div className="flex flex-col gap-1.5">
                        <Button
                            onClick={() => sweepAlertsMut.mutate()}
                            loading={sweepAlertsMut.isPending}
                            variant="outline"
                            size="sm"
                            className="justify-start"
                            title="Cari alert netwatch_down yang IP-nya sudah berubah/up tapi alert belum di-resolve. Auto-resolve semua."
                        >
                            <Wand2 className="w-4 h-4 mr-2" /> Sweep Stale Alerts
                        </Button>
                        <div className="text-[10px] text-slate-500 leading-snug px-1">
                            <span className="text-amber-300/80 font-semibold">Jika:</span> "Unresolved Alerts" tinggi, atau alert lama masih muncul padahal device sudah UP.
                            <br/>
                            <span className="text-slate-400">Efek:</span> auto-resolve alert nyangkut.
                        </div>
                    </div>

                    <div className="flex flex-col gap-1.5">
                        <Button
                            onClick={() => vacuumMut.mutate('client_bandwidth_history')}
                            loading={vacuumMut.isPending}
                            variant="outline"
                            size="sm"
                            className="justify-start"
                            title="Defragment dan analyze tabel client_bandwidth_history. Reklaim disk dari row yang sudah ter-delete. Bisa lambat di tabel besar."
                        >
                            <Database className="w-4 h-4 mr-2" /> VACUUM bandwidth
                        </Button>
                        <div className="text-[10px] text-slate-500 leading-snug px-1">
                            <span className="text-amber-300/80 font-semibold">Jika:</span> baru selesai Prune Retention, ukuran tabel belum turun.
                            <br/>
                            <span className="text-slate-400">Efek:</span> reklaim ruang disk, optimalkan query planner.
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Scaling Features */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-sm">Scaling Features (Fase A & B)</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {features.map((f) => (
                            <div key={f.id} className="rounded-lg border border-slate-800 bg-slate-900/40 p-3 flex items-start gap-3">
                                <span className="font-mono text-[10px] font-bold bg-emerald-500/15 text-emerald-400 px-2 py-1 rounded shrink-0">{f.id}</span>
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-semibold text-white">{f.title}</span>
                                        {f.active && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
                                    </div>
                                    <div className="text-[11px] text-slate-400 font-mono mt-0.5 break-all">{f.config}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>

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

            {/* Router health — breakers / back-off */}
            {(routerHealth.breakers.length > 0 || routerHealth.backoffs.length > 0) && (
                <Card>
                    <CardHeader><CardTitle className="text-sm flex items-center gap-2 text-amber-400"><AlertCircle className="w-4 h-4" /> Router Health (Adaptive)</CardTitle></CardHeader>
                    <CardContent className="space-y-2">
                        {routerHealth.breakers.length > 0 && (
                            <div>
                                <div className="text-[10px] uppercase tracking-wider text-red-400 mb-1">Circuit Breaker Open</div>
                                {routerHealth.breakers.map((b, i) => (
                                    <div key={i} className="flex items-center justify-between text-xs bg-red-500/5 border border-red-500/20 rounded px-3 py-1.5">
                                        <span className="font-mono text-slate-300">{b.routerId.slice(0, 8)}…</span>
                                        <span className="font-mono text-red-400">{b.failures} fail · cooldown {b.openForSec}s</span>
                                    </div>
                                ))}
                            </div>
                        )}
                        {routerHealth.backoffs.length > 0 && (
                            <div>
                                <div className="text-[10px] uppercase tracking-wider text-amber-400 mb-1">Adaptive Back-off</div>
                                {routerHealth.backoffs.map((b, i) => (
                                    <div key={i} className="flex items-center justify-between text-xs bg-amber-500/5 border border-amber-500/20 rounded px-3 py-1.5">
                                        <span className="font-mono text-slate-300">{b.routerId.slice(0, 8)}…</span>
                                        <span className="font-mono text-amber-400">{b.failures} fail · skip {b.eligibleInSec}s</span>
                                    </div>
                                ))}
                            </div>
                        )}
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
