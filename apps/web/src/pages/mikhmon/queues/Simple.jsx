import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Plus, Pencil, Trash2, Gauge, RefreshCw, Search, ChevronRight, ChevronDown, Activity } from 'lucide-react';
import {
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import clsx from 'clsx';
import { useMikhmonContext } from '@/contexts/useMikhmonContext';
import {
    useSimpleQueues,
    useAddSimpleQueue,
    useUpdateSimpleQueue,
    useDeleteSimpleQueue,
    useSimpleQueueStats,
} from '@/hooks/useMikhmon';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { DeleteConfirmationModal } from '@/components/ui/DeleteConfirmationModal';

/**
 * MikHMON-equivalent /queue/simple manager.
 *
 * - Table lists every simple queue with rx/tx max-limit and live bytes.
 * - Expanding a row reveals the live traffic chart powered by the
 *   `/queues/stats` poll, which respects the global auto-refresh
 *   interval and auto-pauses when the tab is hidden.
 * - Form clones the MikHMON v3 layout: required Name+Target, optional
 *   max-limit / limit-at / burst-* / priority / parent / comment.
 */

const EMPTY = {
    name: '',
    target: '',
    maxLimit: '',
    limitAt: '',
    burstLimit: '',
    burstThreshold: '',
    burstTime: '',
    priority: '8',
    parent: 'none',
    queue: '',
    comment: '',
    disabled: false,
};

const HISTORY_LEN = 60; // ~10 minutes at 10s tick

function fmtBps(n) {
    if (!n) return '0';
    if (n < 1_000) return `${n} bps`;
    if (n < 1_000_000) return `${(n / 1_000).toFixed(1)} Kbps`;
    if (n < 1_000_000_000) return `${(n / 1_000_000).toFixed(2)} Mbps`;
    return `${(n / 1_000_000_000).toFixed(2)} Gbps`;
}

function fmtBytes(n) {
    const v = parseInt(n || '0');
    if (!v) return '0 B';
    if (v < 1024) return `${v} B`;
    if (v < 1024 * 1024) return `${(v / 1024).toFixed(1)} KB`;
    if (v < 1024 * 1024 * 1024) return `${(v / (1024 * 1024)).toFixed(1)} MB`;
    return `${(v / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function parseBytesPair(raw) {
    if (!raw) return { rx: '0', tx: '0' };
    const [rx = '0', tx = '0'] = String(raw).split('/');
    return { rx, tx };
}

function Field({ label, hint, children, span = 1 }) {
    return (
        <label className={clsx('flex flex-col gap-1', span === 2 && 'col-span-2')}>
            <span className="text-[10px] font-bold uppercase tracking-wider text-fg-muted">{label}</span>
            {children}
            {hint && <span className="text-[10px] text-slate-600 italic">{hint}</span>}
        </label>
    );
}

function Input({ value, onChange, ...rest }) {
    return (
        <input
            type="text"
            value={value ?? ''}
            onChange={(e) => onChange(e.target.value)}
            className="bg-slate-900/60 border border-slate-700/60 text-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/40"
            {...rest}
        />
    );
}

function QueueFormModal({ isOpen, onClose, initial, onSubmit, isSubmitting, mode }) {
    const [form, setForm] = useState(initial || EMPTY);
    const [showAdvanced, setShowAdvanced] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setForm(initial || EMPTY);
            setShowAdvanced(false);
        }
    }, [isOpen, initial]);

    const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!form.name?.trim() || !form.target?.trim()) return;
        const payload = Object.fromEntries(
            Object.entries(form).filter(([, v]) => v !== '' && v !== undefined && v !== null),
        );
        onSubmit(payload);
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={mode === 'edit' ? `Edit Queue: ${initial?.name || ''}` : 'Tambah Simple Queue'}
            maxWidth="max-w-2xl"
        >
            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field label="Name *" hint={mode === 'edit' ? 'rename via RouterOS perlu hapus + tambah ulang' : 'unik direkomendasikan'}>
                        <Input
                            value={form.name}
                            onChange={(v) => set('name', v)}
                            placeholder="contoh: Pelanggan-Rudi"
                            disabled={mode === 'edit'}
                            required
                        />
                    </Field>
                    <Field label="Target *" hint="IP/CIDR/interface · multi pisah koma">
                        <Input value={form.target} onChange={(v) => set('target', v)} placeholder="192.168.10.50/32" required />
                    </Field>
                    <Field label="Max Limit (rx/tx)" hint="hard cap · contoh: 5M/2M">
                        <Input value={form.maxLimit} onChange={(v) => set('maxLimit', v)} placeholder="5M/2M" />
                    </Field>
                    <Field label="Limit At (rx/tx)" hint="bandwidth garansi · biasanya = max-limit">
                        <Input value={form.limitAt} onChange={(v) => set('limitAt', v)} placeholder="5M/2M" />
                    </Field>
                    <Field label="Priority" hint="1 (tertinggi) – 8 (terendah)">
                        <Input value={form.priority} onChange={(v) => set('priority', v)} placeholder="8" />
                    </Field>
                    <Field label="Parent" hint="parent queue · none = root">
                        <Input value={form.parent} onChange={(v) => set('parent', v)} placeholder="none" />
                    </Field>
                    <Field label="Comment" span={2}>
                        <Input value={form.comment} onChange={(v) => set('comment', v)} placeholder="catatan operator" />
                    </Field>
                </div>

                <button
                    type="button"
                    onClick={() => setShowAdvanced((s) => !s)}
                    className="text-xs text-fg-muted hover:text-slate-200 underline-offset-2 hover:underline"
                >
                    {showAdvanced ? '− Sembunyikan' : '+ Tampilkan'} burst & queue discipline
                </button>

                {showAdvanced && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-lg bg-slate-900/30 border border-slate-800/60">
                        <Field label="Burst Limit (rx/tx)" hint="ceiling burst · contoh: 10M/5M">
                            <Input value={form.burstLimit} onChange={(v) => set('burstLimit', v)} placeholder="" />
                        </Field>
                        <Field label="Burst Threshold (rx/tx)" hint="trigger burst saat avg < ini">
                            <Input value={form.burstThreshold} onChange={(v) => set('burstThreshold', v)} placeholder="" />
                        </Field>
                        <Field label="Burst Time" hint="contoh: 8s">
                            <Input value={form.burstTime} onChange={(v) => set('burstTime', v)} placeholder="" />
                        </Field>
                        <Field label="Queue Discipline" hint="contoh: default/default, pcq/pcq">
                            <Input value={form.queue} onChange={(v) => set('queue', v)} placeholder="default/default" />
                        </Field>
                    </div>
                )}

                <label className="flex items-center gap-2 text-xs text-fg cursor-pointer">
                    <input
                        type="checkbox"
                        checked={!!form.disabled}
                        onChange={(e) => set('disabled', e.target.checked)}
                        className="rounded border-slate-700 bg-slate-900 text-primary focus:ring-primary/40"
                    />
                    <span>Disabled (queue dibuat tapi tidak aktif)</span>
                </label>

                <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2 pt-2 border-t border-slate-800/40">
                    <Button type="button" variant="ghost" onClick={onClose} disabled={isSubmitting}>Batal</Button>
                    <Button
                        type="submit"
                        loading={isSubmitting}
                        disabled={isSubmitting || !form.name?.trim() || !form.target?.trim()}
                    >
                        {mode === 'edit' ? 'Update' : 'Tambah'}
                    </Button>
                </div>
            </form>
        </Modal>
    );
}

/**
 * Per-queue rolling traffic chart. Keeps a small ring buffer locally so
 * the chart doesn't require a backend timeseries store — every poll
 * just appends a sample. Old samples scroll off the left.
 */
function QueueTrafficChart({ queueId, stats }) {
    const historyRef = useRef([]);

    useEffect(() => {
        if (!stats) return;
        const found = stats.find((s) => s.id === queueId);
        if (!found) return;
        const ts = new Date();
        const sample = {
            t: ts.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            rx: found.rateRx,
            tx: found.rateTx,
        };
        const next = [...historyRef.current, sample].slice(-HISTORY_LEN);
        historyRef.current = next;
    }, [stats, queueId]);

    const data = historyRef.current;

    if (data.length === 0) {
        return (
            <div className="h-40 flex items-center justify-center text-xs text-fg-muted">
                <Activity className="w-4 h-4 mr-2 animate-pulse" />
                Menunggu sample pertama…
            </div>
        );
    }

    const latest = data[data.length - 1] || { rx: 0, tx: 0 };

    return (
        <div className="space-y-2">
            <div className="flex items-center gap-4 text-xs">
                <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-cyan-400" />
                    <span className="text-fg-muted">RX</span>
                    <span className="font-mono font-bold text-cyan-300">{fmtBps(latest.rx)}</span>
                </span>
                <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-amber-400" />
                    <span className="text-fg-muted">TX</span>
                    <span className="font-mono font-bold text-amber-300">{fmtBps(latest.tx)}</span>
                </span>
            </div>
            <div className="h-40 -ml-2">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data}>
                        <defs>
                            <linearGradient id="qRx" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.5} />
                                <stop offset="95%" stopColor="#22d3ee" stopOpacity={0.05} />
                            </linearGradient>
                            <linearGradient id="qTx" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#fbbf24" stopOpacity={0.5} />
                                <stop offset="95%" stopColor="#fbbf24" stopOpacity={0.05} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                        <XAxis dataKey="t" tick={{ fill: '#64748b', fontSize: 10 }} stroke="#334155" />
                        <YAxis tick={{ fill: '#64748b', fontSize: 10 }} stroke="#334155" tickFormatter={fmtBps} width={70} />
                        <Tooltip
                            contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '8px', fontSize: '12px' }}
                            formatter={(v) => fmtBps(v)}
                        />
                        <Area type="monotone" dataKey="rx" stroke="#22d3ee" fill="url(#qRx)" strokeWidth={2} isAnimationActive={false} />
                        <Area type="monotone" dataKey="tx" stroke="#fbbf24" fill="url(#qTx)" strokeWidth={2} isAnimationActive={false} />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}

export default function SimpleQueues() {
    const { selectedRouterId } = useMikhmonContext();
    const { data: items = [], isPending, isError, refetch, isFetching } = useSimpleQueues(selectedRouterId);
    const { data: stats = [] } = useSimpleQueueStats(selectedRouterId);
    const addMutation = useAddSimpleQueue(selectedRouterId);
    const updateMutation = useUpdateSimpleQueue(selectedRouterId);
    const deleteMutation = useDeleteSimpleQueue(selectedRouterId);

    const [modalMode, setModalMode] = useState(null);
    const [editing, setEditing] = useState(null);
    const [deleting, setDeleting] = useState(null);
    const [search, setSearch] = useState('');
    const [expandedId, setExpandedId] = useState(null);

    const statsById = useMemo(() => {
        const m = {};
        (stats || []).forEach((s) => { m[s.id] = s; });
        return m;
    }, [stats]);

    const filtered = useMemo(() => {
        if (!search.trim()) return items;
        const q = search.toLowerCase();
        return items.filter((x) =>
            String(x.name || '').toLowerCase().includes(q) ||
            String(x.target || '').toLowerCase().includes(q) ||
            String(x.comment || '').toLowerCase().includes(q),
        );
    }, [items, search]);

    const handleAdd = (payload) =>
        addMutation.mutate(payload, { onSuccess: () => setModalMode(null) });

    const handleEdit = (payload) => {
        // RouterOS treats `name` as primary key — strip on update
        const { name: _name, ...rest } = payload;
        void _name;
        updateMutation.mutate(
            { id: editing.id, input: rest },
            { onSuccess: () => { setModalMode(null); setEditing(null); } },
        );
    };

    const handleDelete = () => {
        if (!deleting?.id) return;
        deleteMutation.mutate(deleting.id, { onSuccess: () => setDeleting(null) });
    };

    return (
        <div className="space-y-4 max-w-6xl">
            <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3">
                    <Gauge className="w-5 h-5 text-primary" />
                    <div>
                        <h1 className="text-xl font-bold text-slate-100">Simple Queue</h1>
                        <p className="text-xs text-fg-muted">Bandwidth limit per IP/network. Klik baris untuk lihat traffic real-time.</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => refetch()}
                        disabled={isFetching}
                        className="p-2 rounded-lg text-fg-muted hover:text-slate-200 hover:bg-white/5 disabled:opacity-40"
                        title="Refresh"
                    >
                        <RefreshCw className={clsx('w-4 h-4', isFetching && 'animate-spin')} />
                    </button>
                    <Button size="sm" onClick={() => { setEditing(null); setModalMode('add'); }} disabled={!selectedRouterId}>
                        <Plus className="w-4 h-4 mr-1" />
                        Tambah Queue
                    </Button>
                </div>
            </div>

            <div className="relative">
                <Search className="w-4 h-4 text-fg-muted absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Cari name, target, atau comment…"
                    className="w-full pl-9 pr-3 py-2 bg-slate-900/60 border border-slate-700/60 text-slate-200 text-sm rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
            </div>

            {isError && (
                <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                    Gagal ambil queue. Cek koneksi router.
                </div>
            )}

            <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 overflow-hidden">
                <div className="overflow-x-auto custom-scrollbar">
                    <table className="w-full text-sm min-w-[800px]">
                        <thead className="bg-slate-900/70 text-[10px] font-bold uppercase tracking-wider text-fg-muted">
                            <tr>
                                <th className="w-8"></th>
                                <th className="text-left px-4 py-2.5">Name</th>
                                <th className="text-left px-4 py-2.5">Target</th>
                                <th className="text-left px-4 py-2.5">Max Limit</th>
                                <th className="text-left px-4 py-2.5">Rate (rx/tx)</th>
                                <th className="text-left px-4 py-2.5">Bytes</th>
                                <th className="text-right px-4 py-2.5">Aksi</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/40">
                            {isPending ? (
                                <tr><td colSpan={7} className="px-4 py-8 text-center text-fg-muted text-xs">Memuat…</td></tr>
                            ) : filtered.length === 0 ? (
                                <tr><td colSpan={7} className="px-4 py-8 text-center text-fg-muted text-xs">
                                    {items.length === 0 ? 'Belum ada queue. Klik "Tambah Queue" untuk mulai.' : 'Tidak ada queue cocok pencarian.'}
                                </td></tr>
                            ) : filtered.map((q) => {
                                const s = statsById[q.id];
                                const bytes = parseBytesPair(q.bytes);
                                const isExpanded = expandedId === q.id;
                                return (
                                    <React.Fragment key={q.id}>
                                        <tr
                                            className={clsx(
                                                'hover:bg-slate-800/30 transition-colors cursor-pointer',
                                                q.disabled && 'opacity-50',
                                                q.dynamic && 'italic',
                                            )}
                                            onClick={() => setExpandedId(isExpanded ? null : q.id)}
                                        >
                                            <td className="px-2 py-2.5 text-fg-muted">
                                                {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                                            </td>
                                            <td className="px-4 py-2.5 font-semibold text-slate-200">
                                                {q.name}
                                                {q.dynamic && <span className="ml-2 text-[9px] px-1.5 py-0.5 bg-slate-700/50 text-fg-muted rounded uppercase">dynamic</span>}
                                            </td>
                                            <td className="px-4 py-2.5 font-mono text-xs text-fg max-w-xs truncate">{q.target || <span className="text-slate-600">—</span>}</td>
                                            <td className="px-4 py-2.5 font-mono text-xs text-fg">{q.maxLimit || <span className="text-slate-600">unlimited</span>}</td>
                                            <td className="px-4 py-2.5 font-mono text-xs">
                                                {s ? (
                                                    <div className="flex flex-col">
                                                        <span className="text-cyan-300">↓ {fmtBps(s.rateRx)}</span>
                                                        <span className="text-amber-300">↑ {fmtBps(s.rateTx)}</span>
                                                    </div>
                                                ) : <span className="text-slate-600">—</span>}
                                            </td>
                                            <td className="px-4 py-2.5 font-mono text-xs text-fg-muted">
                                                <div className="flex flex-col">
                                                    <span>↓ {fmtBytes(bytes.rx)}</span>
                                                    <span>↑ {fmtBytes(bytes.tx)}</span>
                                                </div>
                                            </td>
                                            <td className="px-4 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                                                <div className="inline-flex items-center gap-1">
                                                    <button
                                                        onClick={() => { setEditing(q); setModalMode('edit'); }}
                                                        disabled={q.dynamic}
                                                        className="p-1.5 rounded-lg text-fg-muted hover:text-slate-200 hover:bg-white/5 disabled:opacity-30"
                                                        title={q.dynamic ? 'Queue dynamic tidak bisa di-edit' : 'Edit'}
                                                    >
                                                        <Pencil className="w-3.5 h-3.5" />
                                                    </button>
                                                    <button
                                                        onClick={() => setDeleting(q)}
                                                        disabled={q.dynamic}
                                                        className="p-1.5 rounded-lg text-red-400 hover:text-red-300 hover:bg-red-500/10 disabled:opacity-30"
                                                        title={q.dynamic ? 'Queue dynamic — managed by RouterOS' : 'Hapus'}
                                                    >
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                        {isExpanded && (
                                            <tr className="bg-slate-900/60">
                                                <td colSpan={7} className="px-4 py-4">
                                                    <QueueTrafficChart queueId={q.id} stats={stats} />
                                                </td>
                                            </tr>
                                        )}
                                    </React.Fragment>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
                {filtered.length > 0 && (
                    <div className="px-4 py-2 border-t border-slate-800/40 text-[10px] uppercase tracking-wider text-fg-muted bg-slate-900/30">
                        Total: <span className="text-fg font-bold">{filtered.length}</span>
                        {filtered.length !== items.length && <> dari {items.length}</>}
                    </div>
                )}
            </div>

            <QueueFormModal
                isOpen={modalMode === 'add'}
                onClose={() => setModalMode(null)}
                initial={null}
                onSubmit={handleAdd}
                isSubmitting={addMutation.isPending}
                mode="add"
            />
            <QueueFormModal
                isOpen={modalMode === 'edit'}
                onClose={() => { setModalMode(null); setEditing(null); }}
                initial={editing}
                onSubmit={handleEdit}
                isSubmitting={updateMutation.isPending}
                mode="edit"
            />

            <DeleteConfirmationModal
                isOpen={!!deleting}
                onClose={() => setDeleting(null)}
                onConfirm={handleDelete}
                title="Hapus Simple Queue"
                message="Queue akan dihapus dari MikroTik. Bandwidth limit untuk target ini akan hilang."
                itemName={deleting?.name || ''}
                confirmText="Hapus Queue"
                isDeleting={deleteMutation.isPending}
            />
        </div>
    );
}
