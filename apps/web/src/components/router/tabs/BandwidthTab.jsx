import React, { useMemo, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Activity, ArrowDown, ArrowUp, Download, RefreshCw, Search, X, BarChart2 } from 'lucide-react';
import clsx from 'clsx';
import {
    ResponsiveContainer,
    AreaChart,
    CartesianGrid,
    XAxis,
    YAxis,
    Tooltip,
    Area,
    Legend,
} from 'recharts';
import { useBandwidthTop, useBandwidthClientHistory, useBandwidthSummary } from '@/hooks';

const PERIOD_OPTIONS = [
    { value: '1h', label: '1 Jam' },
    { value: '6h', label: '6 Jam' },
    { value: '24h', label: '24 Jam' },
    { value: '7d', label: '7 Hari' },
    { value: '30d', label: '30 Hari' },
];

const TYPE_OPTIONS = [
    { value: '', label: 'Semua' },
    { value: 'pppoe_user', label: 'PPPoE User' },
    { value: 'queue_name', label: 'Simple Queue' },
];

function formatBytes(value) {
    const n = Number(value || 0);
    if (!Number.isFinite(n) || n <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
    let v = n;
    let i = 0;
    while (v >= 1024 && i < units.length - 1) {
        v /= 1024;
        i++;
    }
    return `${v.toFixed(v < 10 && i > 0 ? 2 : 1)} ${units[i]}`;
}

function formatBitrate(bps) {
    const n = Number(bps || 0);
    if (!Number.isFinite(n) || n <= 0) return '0 bps';
    const units = ['bps', 'kbps', 'Mbps', 'Gbps'];
    let v = n;
    let i = 0;
    while (v >= 1000 && i < units.length - 1) {
        v /= 1000;
        i++;
    }
    return `${v.toFixed(v < 10 && i > 0 ? 2 : 1)} ${units[i]}`;
}

function exportToCsv(rows, period) {
    const header = ['Rank', 'Client', 'Type', 'Upload (bytes)', 'Download (bytes)', 'Total (bytes)', 'Samples'];
    const lines = rows.map((r, idx) => [
        idx + 1,
        r.identifier,
        r.identifier_type,
        r.tx_bytes,
        r.rx_bytes,
        r.total_bytes,
        r.samples,
    ].join(','));
    const csv = [header.join(','), ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bandwidth-top-${period}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function ClientHistoryDialog({ routerId, identifier, identifierType, onClose }) {
    const [period, setPeriod] = useState('24h');
    const { data: history = [], isLoading } = useBandwidthClientHistory(routerId, identifier, {
        period,
        type: identifierType,
        enabled: !!identifier,
    });

    const chartData = useMemo(() => history.map(p => ({
        ts: new Date(p.ts).getTime(),
        tx_bps: p.tx_bps,
        rx_bps: p.rx_bps,
    })), [history]);

    const totals = useMemo(() => history.reduce(
        (acc, p) => ({ tx: acc.tx + Number(p.tx_bytes || 0), rx: acc.rx + Number(p.rx_bytes || 0) }),
        { tx: 0, rx: 0 },
    ), [history]);

    return (
        <div className="fixed inset-0 z-[1000] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="w-full max-w-4xl bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden">
                <div className="flex items-center justify-between gap-3 border-b border-slate-800 px-5 py-3">
                    {/* min-w-0 + truncate supaya identifier panjang (MAC 17 char,
                        IPv6 39 char, hostname panjang) tidak push close X
                        keluar viewport di lebar 320-360px. shrink-0 pada button
                        biar tombol selalu terlihat. */}
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 text-fg font-semibold min-w-0">
                            <Activity className="w-4 h-4 text-primary shrink-0" />
                            <span className="font-mono truncate">{identifier}</span>
                            <span className="text-xs text-fg-muted uppercase shrink-0">{identifierType}</span>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-fg-muted hover:text-fg shrink-0">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-5 space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex gap-1 bg-slate-800/50 rounded-lg p-1">
                            {PERIOD_OPTIONS.map(p => (
                                <button
                                    key={p.value}
                                    onClick={() => setPeriod(p.value)}
                                    className={clsx(
                                        'px-3 py-1 text-xs rounded transition-colors',
                                        period === p.value ? 'bg-primary text-[var(--on-primary)]' : 'text-fg-muted hover:text-fg'
                                    )}
                                >
                                    {p.label}
                                </button>
                            ))}
                        </div>
                        <div className="flex gap-4 text-xs">
                            <div className="flex items-center gap-1.5">
                                <ArrowUp className="w-3.5 h-3.5 text-blue-400" />
                                <span className="text-fg-muted">Upload:</span>
                                <span className="text-fg font-mono">{formatBytes(totals.tx)}</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <ArrowDown className="w-3.5 h-3.5 text-emerald-400" />
                                <span className="text-fg-muted">Download:</span>
                                <span className="text-fg font-mono">{formatBytes(totals.rx)}</span>
                            </div>
                        </div>
                    </div>

                    <div className="h-72 bg-slate-950/50 rounded-lg p-2">
                        {isLoading ? (
                            <div className="flex items-center justify-center h-full text-fg-muted">
                                <RefreshCw className="w-5 h-5 animate-spin" />
                            </div>
                        ) : chartData.length === 0 ? (
                            <div className="flex items-center justify-center h-full text-fg-muted text-sm">
                                Belum ada data untuk periode ini
                            </div>
                        ) : (
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={chartData}>
                                    <defs>
                                        <linearGradient id="g-tx" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor="#60a5fa" stopOpacity={0.4} />
                                            <stop offset="100%" stopColor="#60a5fa" stopOpacity={0} />
                                        </linearGradient>
                                        <linearGradient id="g-rx" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor="#34d399" stopOpacity={0.4} />
                                            <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid stroke="#1e293b" />
                                    <XAxis
                                        dataKey="ts"
                                        type="number"
                                        domain={['dataMin', 'dataMax']}
                                        scale="time"
                                        tickFormatter={(t) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        tick={{ fill: '#64748b', fontSize: 10 }}
                                    />
                                    <YAxis
                                        tick={{ fill: '#64748b', fontSize: 10 }}
                                        tickFormatter={formatBitrate}
                                    />
                                    <Tooltip
                                        contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8 }}
                                        labelFormatter={(t) => new Date(t).toLocaleString()}
                                        formatter={(v, name) => [formatBitrate(v), name === 'tx_bps' ? 'Upload' : 'Download']}
                                    />
                                    <Legend wrapperStyle={{ fontSize: 11 }} formatter={(v) => v === 'tx_bps' ? 'Upload' : 'Download'} />
                                    <Area type="monotone" dataKey="tx_bps" stroke="#60a5fa" fill="url(#g-tx)" strokeWidth={2} />
                                    <Area type="monotone" dataKey="rx_bps" stroke="#34d399" fill="url(#g-rx)" strokeWidth={2} />
                                </AreaChart>
                            </ResponsiveContainer>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

function BandwidthTab({ routerId }) {
    const [period, setPeriod] = useState('24h');
    const [type, setType] = useState('');
    const [search, setSearch] = useState('');
    const [selected, setSelected] = useState(null);

    const { data: rows = [], isLoading, isRefetching, refetch } = useBandwidthTop(routerId, {
        period,
        limit: 50,
        type: type || null,
    });
    const { data: summary } = useBandwidthSummary(routerId);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return rows;
        return rows.filter(r => String(r.identifier).toLowerCase().includes(q));
    }, [rows, search]);

    const top1Total = filtered[0]?.total_bytes ? Number(filtered[0].total_bytes) : 0;

    return (
        <div className="space-y-4">
            {/* Summary cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <Card>
                    <CardContent className="p-4">
                        <div className="text-xs uppercase text-fg-muted tracking-wide mb-1">Client Aktif (24j)</div>
                        <div className="text-2xl font-bold text-fg">{summary?.active_clients_24h ?? '—'}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4">
                        <div className="text-xs uppercase text-fg-muted tracking-wide mb-1">Total Upload (24j)</div>
                        <div className="text-2xl font-bold text-blue-400 font-mono">{formatBytes(summary?.tx_bytes_24h)}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4">
                        <div className="text-xs uppercase text-fg-muted tracking-wide mb-1">Total Download (24j)</div>
                        <div className="text-2xl font-bold text-emerald-400 font-mono">{formatBytes(summary?.rx_bytes_24h)}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="p-4">
                        <div className="text-xs uppercase text-fg-muted tracking-wide mb-1">Sampel Polling</div>
                        <div className="text-2xl font-bold text-fg">{summary?.samples_24h ?? '—'}</div>
                    </CardContent>
                </Card>
            </div>

            {/* Toolbar */}
            <Card>
                <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                        <BarChart2 className="w-5 h-5 text-primary" />
                        Top {filtered.length} Client Pemakai Bandwidth
                    </CardTitle>
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-fg-muted" />
                            <input
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                placeholder="Cari client…"
                                className="bg-slate-900 border border-slate-700 text-fg text-xs rounded-lg pl-9 pr-3 py-1.5 focus:ring-1 focus:ring-primary w-40"
                            />
                        </div>
                        <select
                            value={type}
                            onChange={e => setType(e.target.value)}
                            className="bg-slate-900 border border-slate-700 text-fg text-xs rounded-lg px-2 py-1.5"
                        >
                            {TYPE_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                        </select>
                        <div className="flex gap-1 bg-slate-800/50 rounded-lg p-1">
                            {PERIOD_OPTIONS.map(p => (
                                <button
                                    key={p.value}
                                    onClick={() => setPeriod(p.value)}
                                    className={clsx(
                                        'px-2.5 py-1 text-xs rounded transition-colors',
                                        period === p.value ? 'bg-primary text-[var(--on-primary)]' : 'text-fg-muted hover:text-fg'
                                    )}
                                >
                                    {p.label}
                                </button>
                            ))}
                        </div>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => refetch()}
                            disabled={isRefetching}
                            title="Refresh"
                        >
                            <RefreshCw className={clsx('w-4 h-4', isRefetching && 'animate-spin')} />
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => exportToCsv(filtered, period)}
                            disabled={filtered.length === 0}
                            title="Export CSV"
                        >
                            <Download className="w-4 h-4" />
                        </Button>
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    {isLoading ? (
                        <div className="p-8 text-center text-fg-muted">
                            <RefreshCw className="w-6 h-6 mx-auto animate-spin mb-2" />
                            Memuat data…
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="p-8 text-center text-fg-muted text-sm">
                            Belum ada data bandwidth untuk periode ini.<br />
                            <span className="text-xs text-fg-muted">Pengumpulan data dimulai sejak deployment terakhir — beri waktu beberapa menit setelah polling pertama.</span>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="bg-slate-900/50 text-xs text-fg-muted uppercase">
                                    <tr>
                                        <th className="text-left px-4 py-2 w-10">#</th>
                                        <th className="text-left px-4 py-2">Client</th>
                                        <th className="text-left px-4 py-2 hidden sm:table-cell">Tipe</th>
                                        <th className="text-right px-4 py-2">Upload</th>
                                        <th className="text-right px-4 py-2">Download</th>
                                        <th className="text-right px-4 py-2 font-bold">Total</th>
                                        <th className="text-left px-4 py-2 w-32 hidden md:table-cell">Bar</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-800">
                                    {filtered.map((r, idx) => {
                                        const total = Number(r.total_bytes || 0);
                                        const pct = top1Total > 0 ? (total / top1Total) * 100 : 0;
                                        return (
                                            <tr
                                                key={`${r.identifier}-${r.identifier_type}`}
                                                onClick={() => setSelected({ identifier: r.identifier, identifierType: r.identifier_type })}
                                                className="hover:bg-slate-800/30 cursor-pointer"
                                            >
                                                <td className="px-4 py-2 text-fg-muted">{idx + 1}</td>
                                                <td className="px-4 py-2 font-mono text-fg">{r.identifier}</td>
                                                <td className="px-4 py-2 text-fg-muted text-xs uppercase hidden sm:table-cell">
                                                    {r.identifier_type === 'pppoe_user' ? 'PPPoE' : 'Queue'}
                                                </td>
                                                <td className="px-4 py-2 text-right text-blue-400 font-mono">{formatBytes(r.tx_bytes)}</td>
                                                <td className="px-4 py-2 text-right text-emerald-400 font-mono">{formatBytes(r.rx_bytes)}</td>
                                                <td className="px-4 py-2 text-right text-fg font-mono font-semibold">{formatBytes(total)}</td>
                                                <td className="px-4 py-2 hidden md:table-cell">
                                                    <div className="h-1.5 bg-slate-800 rounded overflow-hidden">
                                                        <div
                                                            className="h-full bg-gradient-to-r from-blue-500 to-emerald-500 rounded"
                                                            style={{ width: `${pct}%` }}
                                                        />
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </CardContent>
            </Card>

            {selected && (
                <ClientHistoryDialog
                    routerId={routerId}
                    identifier={selected.identifier}
                    identifierType={selected.identifierType}
                    onClose={() => setSelected(null)}
                />
            )}
        </div>
    );
}

export default BandwidthTab;
