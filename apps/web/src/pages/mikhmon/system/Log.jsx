import React, { useState, useMemo } from 'react';
import { ScrollText, RefreshCw, Search } from 'lucide-react';
import clsx from 'clsx';
import { useMikhmonContext } from '@/contexts/useMikhmonContext';
import { useSystemLog } from '@/hooks/useMikhmon';

/**
 * /log/print viewer.
 * Topic filter is sent server-side (saves bandwidth on noisy routers).
 * Free-text search filters client-side over message column.
 */

const COMMON_TOPICS = [
    'all', 'system', 'hotspot', 'ppp', 'dhcp', 'firewall',
    'error', 'warning', 'info', 'critical', 'wireless',
];

function topicColor(t) {
    if (!t) return 'text-fg-muted';
    const lower = t.toLowerCase();
    if (lower.includes('error') || lower.includes('critical')) return 'text-red-400';
    if (lower.includes('warning')) return 'text-yellow-400';
    if (lower.includes('hotspot')) return 'text-cyan-300';
    if (lower.includes('ppp')) return 'text-emerald-300';
    if (lower.includes('dhcp')) return 'text-purple-300';
    return 'text-fg';
}

export default function SystemLog() {
    const { selectedRouterId } = useMikhmonContext();
    const [topic, setTopic] = useState('all');
    const [limit, setLimit] = useState(200);
    const [search, setSearch] = useState('');

    const { data: entries = [], isPending, isError, refetch, isFetching } = useSystemLog(
        selectedRouterId,
        { topics: topic === 'all' ? undefined : topic, limit },
    );

    const filtered = useMemo(() => {
        if (!search.trim()) return entries;
        const q = search.toLowerCase();
        return entries.filter((e) =>
            String(e.message || '').toLowerCase().includes(q) ||
            String(e.topics || '').toLowerCase().includes(q),
        );
    }, [entries, search]);

    return (
        <div className="space-y-4 max-w-6xl">
            <div className="flex items-start sm:items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3 min-w-0">
                    <ScrollText className="w-5 h-5 text-primary shrink-0" />
                    <div className="min-w-0">
                        <h1 className="text-xl font-bold text-slate-100">System Log</h1>
                        <p className="text-xs text-fg-muted">RouterOS log buffer. Latest entry di atas.</p>
                    </div>
                </div>
                <button
                    onClick={() => refetch()}
                    disabled={isFetching}
                    className="p-2 rounded-lg text-fg-muted hover:text-slate-200 hover:bg-white/5 disabled:opacity-40"
                    title="Refresh"
                >
                    <RefreshCw className={clsx('w-4 h-4', isFetching && 'animate-spin')} />
                </button>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
                <select
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    className="bg-surface-dark/60 border border-slate-border/60 text-slate-200 text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/40"
                >
                    {COMMON_TOPICS.map((t) => (
                        <option key={t} value={t}>topic: {t}</option>
                    ))}
                </select>
                <select
                    value={limit}
                    onChange={(e) => setLimit(parseInt(e.target.value, 10))}
                    className="bg-surface-dark/60 border border-slate-border/60 text-slate-200 text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/40"
                >
                    {[100, 200, 500, 1000, 2000].map((n) => (
                        <option key={n} value={n}>limit: {n}</option>
                    ))}
                </select>
                <div className="relative flex-1 min-w-[200px]">
                    <Search className="w-4 h-4 text-fg-muted absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Filter message / topic…"
                        className="w-full pl-9 pr-3 py-1.5 bg-surface-dark/60 border border-slate-border/60 text-slate-200 text-sm rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/40"
                    />
                </div>
            </div>

            {isError && (
                <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                    Gagal ambil system log.
                </div>
            )}

            <div className="rounded-xl border border-slate-border/60 bg-surface-dark/40 overflow-hidden">
                <div className="overflow-x-auto custom-scrollbar">
                    <table className="w-full text-sm min-w-[700px] font-mono">
                        <thead className="bg-surface-dark/70 text-[10px] font-bold uppercase tracking-wider text-fg-muted font-sans">
                            <tr>
                                <th className="text-left px-3 py-2.5 w-[100px]">Time</th>
                                <th className="text-left px-3 py-2.5 w-[160px]">Topics</th>
                                <th className="text-left px-3 py-2.5">Message</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/40">
                            {isPending ? (
                                <tr><td colSpan={3} className="px-3 py-8 text-center text-fg-muted text-xs font-sans">Memuat…</td></tr>
                            ) : filtered.length === 0 ? (
                                <tr><td colSpan={3} className="px-3 py-8 text-center text-fg-muted text-xs font-sans">
                                    {entries.length === 0 ? 'Log buffer kosong / topic tidak punya entry.' : 'Tidak ada log cocok filter search.'}
                                </td></tr>
                            ) : filtered.map((e) => (
                                <tr key={e.id} className="hover:bg-slate-surface/30 transition-colors">
                                    <td className="px-3 py-1.5 text-[11px] text-fg-muted whitespace-nowrap align-top">{e.time || '—'}</td>
                                    <td className="px-3 py-1.5 text-[11px] align-top">
                                        <span className={clsx('break-all', topicColor(e.topics))}>{e.topics || '—'}</span>
                                    </td>
                                    <td className="px-3 py-1.5 text-[11px] text-fg break-words">{e.message}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                {filtered.length > 0 && (
                    <div className="px-4 py-2 border-t border-slate-border/40 text-[10px] uppercase tracking-wider text-fg-muted bg-surface-dark/30">
                        Tampil: <span className="text-fg font-bold">{filtered.length}</span>
                        {filtered.length !== entries.length && <> dari {entries.length}</>}
                    </div>
                )}
            </div>
        </div>
    );
}
