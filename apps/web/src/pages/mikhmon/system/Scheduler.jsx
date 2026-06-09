import React, { useState, useMemo, useEffect } from 'react';
import { Plus, Pencil, Trash2, Activity, RefreshCw, Search } from 'lucide-react';
import clsx from 'clsx';
import { useMikhmonContext } from '@/contexts/useMikhmonContext';
import {
    useSystemScheduler,
    useAddSystemScheduler,
    useUpdateSystemScheduler,
    useDeleteSystemScheduler,
} from '@/hooks/useMikhmon';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { DeleteConfirmationModal } from '@/components/ui/DeleteConfirmationModal';

const EMPTY = {
    name: '',
    onEvent: '',
    startTime: 'startup',
    startDate: '',
    interval: '',
    comment: '',
    disabled: false,
};

function Field({ label, hint, children, span = 1 }) {
    return (
        <label className={clsx('flex flex-col gap-1', span === 2 && 'sm:col-span-2')}>
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

function SchedulerFormModal({ isOpen, onClose, initial, onSubmit, isSubmitting, mode }) {
    const [form, setForm] = useState(initial || EMPTY);

    useEffect(() => {
        if (isOpen) setForm(initial || EMPTY);
    }, [isOpen, initial]);

    const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!form.name?.trim() || !form.onEvent?.trim()) return;
        const payload = Object.fromEntries(
            Object.entries(form).filter(([, v]) => v !== '' && v !== undefined && v !== null),
        );
        onSubmit(payload);
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={mode === 'edit' ? `Edit Scheduler: ${initial?.name || ''}` : 'Tambah Scheduler'}
            maxWidth="max-w-2xl"
        >
            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Field label="Name *">
                        <Input
                            value={form.name}
                            onChange={(v) => set('name', v)}
                            placeholder="mikhmon-auto-expire"
                            disabled={mode === 'edit'}
                            required
                        />
                    </Field>
                    <Field label="Interval" hint="contoh: 1d, 1h, 30m · kosong = sekali jalan">
                        <Input value={form.interval} onChange={(v) => set('interval', v)} placeholder="1d" />
                    </Field>
                    <Field label="Start Time" hint="startup atau jam (e.g. 03:00:00)">
                        <Input value={form.startTime} onChange={(v) => set('startTime', v)} placeholder="startup" />
                    </Field>
                    <Field label="Start Date" hint="opsional · format: jun/06/2026">
                        <Input value={form.startDate} onChange={(v) => set('startDate', v)} placeholder="" />
                    </Field>
                    <Field label="On Event *" hint="RouterOS script" span={2}>
                        <textarea
                            value={form.onEvent || ''}
                            onChange={(e) => set('onEvent', e.target.value)}
                            rows={6}
                            placeholder={"/system reboot"}
                            className="bg-slate-900/60 border border-slate-700/60 text-slate-200 text-xs font-mono rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary/40"
                            required
                        />
                    </Field>
                    <Field label="Comment" span={2}>
                        <Input value={form.comment} onChange={(v) => set('comment', v)} placeholder="" />
                    </Field>
                </div>

                <label className="flex items-center gap-2 text-xs text-fg cursor-pointer">
                    <input
                        type="checkbox"
                        checked={!!form.disabled}
                        onChange={(e) => set('disabled', e.target.checked)}
                        className="rounded border-slate-700 bg-slate-900 text-primary focus:ring-primary/40"
                    />
                    <span>Disabled</span>
                </label>

                <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2 pt-2 border-t border-slate-800/40">
                    <Button type="button" variant="ghost" onClick={onClose} disabled={isSubmitting}>Batal</Button>
                    <Button
                        type="submit"
                        loading={isSubmitting}
                        disabled={isSubmitting || !form.name?.trim() || !form.onEvent?.trim()}
                    >
                        {mode === 'edit' ? 'Update' : 'Tambah'}
                    </Button>
                </div>
            </form>
        </Modal>
    );
}

export default function SystemScheduler() {
    const { selectedRouterId } = useMikhmonContext();
    const { data: items = [], isPending, isError, refetch, isFetching } = useSystemScheduler(selectedRouterId);
    const addMutation = useAddSystemScheduler(selectedRouterId);
    const updateMutation = useUpdateSystemScheduler(selectedRouterId);
    const deleteMutation = useDeleteSystemScheduler(selectedRouterId);

    const [modalMode, setModalMode] = useState(null);
    const [editing, setEditing] = useState(null);
    const [deleting, setDeleting] = useState(null);
    const [search, setSearch] = useState('');

    const filtered = useMemo(() => {
        if (!search.trim()) return items;
        const q = search.toLowerCase();
        return items.filter((s) =>
            String(s.name || '').toLowerCase().includes(q) ||
            String(s.comment || '').toLowerCase().includes(q) ||
            String(s.onEvent || '').toLowerCase().includes(q),
        );
    }, [items, search]);

    const handleAdd = (payload) =>
        addMutation.mutate(payload, { onSuccess: () => setModalMode(null) });

    const handleEdit = (payload) => {
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
            <div className="flex items-start sm:items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3 min-w-0">
                    <Activity className="w-5 h-5 text-primary shrink-0" />
                    <div className="min-w-0">
                        <h1 className="text-xl font-bold text-slate-100">System Scheduler</h1>
                        <p className="text-xs text-fg-muted">Cron-like job RouterOS · contoh: auto-expire voucher MikHMON.</p>
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
                        <span className="hidden xs:inline">Tambah </span>Schedule
                    </Button>
                </div>
            </div>

            <div className="relative">
                <Search className="w-4 h-4 text-fg-muted absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Cari name, comment, script…"
                    className="w-full pl-9 pr-3 py-2 bg-slate-900/60 border border-slate-700/60 text-slate-200 text-sm rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
            </div>

            {isError && (
                <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                    Gagal ambil scheduler.
                </div>
            )}

            <div className="rounded-xl border border-slate-800/60 bg-slate-900/40 overflow-hidden">
                <div className="overflow-x-auto custom-scrollbar">
                    <table className="w-full text-sm min-w-[700px]">
                        <thead className="bg-slate-900/70 text-[10px] font-bold uppercase tracking-wider text-fg-muted">
                            <tr>
                                <th className="text-left px-4 py-2.5">Name</th>
                                <th className="text-left px-4 py-2.5">Start Time</th>
                                <th className="text-left px-4 py-2.5">Interval</th>
                                <th className="text-left px-4 py-2.5">On Event (preview)</th>
                                <th className="text-left px-4 py-2.5">Comment</th>
                                <th className="text-right px-4 py-2.5">Aksi</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/40">
                            {isPending ? (
                                <tr><td colSpan={6} className="px-4 py-8 text-center text-fg-muted text-xs">Memuat…</td></tr>
                            ) : filtered.length === 0 ? (
                                <tr><td colSpan={6} className="px-4 py-8 text-center text-fg-muted text-xs">
                                    {items.length === 0 ? 'Belum ada scheduler.' : 'Tidak ada scheduler cocok.'}
                                </td></tr>
                            ) : filtered.map((s) => (
                                <tr key={s.id} className={clsx('hover:bg-slate-800/30 transition-colors', s.disabled && 'opacity-50')}>
                                    <td className="px-4 py-2.5 font-semibold text-slate-200">{s.name}</td>
                                    <td className="px-4 py-2.5 font-mono text-xs text-fg">{s.startTime || <span className="text-slate-600">—</span>}</td>
                                    <td className="px-4 py-2.5 font-mono text-xs text-fg">{s.interval || <span className="text-slate-600">—</span>}</td>
                                    <td className="px-4 py-2.5 font-mono text-[10px] text-fg-muted max-w-[250px] truncate" title={s.onEvent}>{s.onEvent || <span className="text-slate-600">—</span>}</td>
                                    <td className="px-4 py-2.5 text-xs text-fg max-w-xs truncate">{s.comment || ''}</td>
                                    <td className="px-4 py-2.5 text-right">
                                        <div className="inline-flex items-center gap-1">
                                            <button
                                                onClick={() => { setEditing(s); setModalMode('edit'); }}
                                                className="p-1.5 rounded-lg text-fg-muted hover:text-slate-200 hover:bg-white/5"
                                                title="Edit"
                                            >
                                                <Pencil className="w-3.5 h-3.5" />
                                            </button>
                                            <button
                                                onClick={() => setDeleting(s)}
                                                className="p-1.5 rounded-lg text-red-400 hover:text-red-300 hover:bg-red-500/10"
                                                title="Hapus"
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
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

            <SchedulerFormModal
                isOpen={modalMode === 'add'}
                onClose={() => setModalMode(null)}
                initial={null}
                onSubmit={handleAdd}
                isSubmitting={addMutation.isPending}
                mode="add"
            />
            <SchedulerFormModal
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
                title="Hapus Scheduler"
                message="Scheduler akan dihapus. Pastikan script tidak dipakai operasi rutin (mis. MikHMON auto-expire)."
                itemName={deleting?.name || ''}
                confirmText="Hapus Scheduler"
                isDeleting={deleteMutation.isPending}
            />
        </div>
    );
}
