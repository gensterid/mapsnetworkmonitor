import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { AlertTriangle, RefreshCw, ShieldCheck, ChevronDown, ChevronRight, ServerCrash } from 'lucide-react';
import clsx from 'clsx';
import {
    useDriftSummary, useDriftScan, useDriftReport, useDriftResync,
} from '@/hooks/useBillingDrift';

const FIELD_LABEL = {
    profile: 'Profile',
    comment: 'Comment',
    disabled: 'Status (disabled)',
    missing: 'Hilang di router',
};

const FIELD_BADGE = {
    profile: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
    comment: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
    disabled: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
    missing: 'bg-red-500/10 text-red-400 border-red-500/30',
};

const fmtDateTime = (d) => d ? new Date(d).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'medium' }) : '—';

export default function DriftTab() {
    const { data: summary } = useDriftSummary();
    const { data: report } = useDriftReport();
    const scan = useDriftScan();
    const resync = useDriftResync();
    const [expanded, setExpanded] = useState({});
    const [confirmRow, setConfirmRow] = useState(null); // {item, kickSession}

    const items = report?.items || [];
    const groupedByRouter = items.reduce((acc, it) => {
        const key = it.routerId;
        if (!acc[key]) acc[key] = { routerName: it.routerName || it.routerId.slice(0, 8), items: [] };
        acc[key].items.push(it);
        return acc;
    }, {});

    const handleResync = async () => {
        if (!confirmRow) return;
        await resync.mutateAsync({
            subscriptionId: confirmRow.item.subscriptionId,
            kickSession: confirmRow.kickSession,
        });
        setConfirmRow(null);
    };

    return (
        <div className="space-y-4">
            <Card>
                <CardHeader>
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div>
                            <CardTitle className="flex items-center gap-2">
                                <AlertTriangle className="w-5 h-5 text-amber-400" />
                                Drift Detection — PPPoE
                            </CardTitle>
                            <p className="text-fg-muted text-xs mt-1">
                                Deteksi inkonsistensi antara DB aplikasi dan PPP secret di MikroTik.
                                Skenario tipikal: aplikasi down → operator edit manual di Winbox →
                                saat app online lagi, drift detector menemukan mismatch.
                            </p>
                            <p className="text-fg-muted text-[11px] mt-1">
                                Default resync = <span className="text-fg font-medium">Push DB → MikroTik</span> (asumsi DB authoritative).
                                Operator tetap kontrol penuh, app tidak auto-apply.
                            </p>
                        </div>
                        <Button onClick={() => scan.mutate()} loading={scan.isPending} className="shrink-0">
                            <RefreshCw className="w-4 h-4 mr-1" />
                            Scan Sekarang
                        </Button>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 text-sm">
                        <Stat label="Total drift" value={summary?.count ?? '—'}
                            tone={summary?.count > 0 ? 'warn' : 'ok'} />
                        <Stat label="Router gagal scan" value={summary?.routersFailed ?? '—'}
                            tone={summary?.routersFailed > 0 ? 'warn' : 'ok'} />
                        <Stat label="Last scan" value={summary?.scannedAt ? fmtDateTime(summary.scannedAt) : 'Belum pernah'}
                            small />
                        <Stat label="Auto scan" value="tiap 1 jam" small />
                    </div>
                </CardContent>
            </Card>

            {report?.routersFailed?.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-red-400 text-sm">
                            <ServerCrash className="w-4 h-4" />
                            Router yang gagal di-scan ({report.routersFailed.length})
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <ul className="text-xs space-y-1 text-fg-muted">
                            {report.routersFailed.map(r => (
                                <li key={r.routerId} className="flex items-baseline gap-2">
                                    <span className="text-fg">{r.routerName || r.routerId.slice(0, 8)}</span>
                                    <span className="text-red-400">— {r.error}</span>
                                </li>
                            ))}
                        </ul>
                    </CardContent>
                </Card>
            )}

            {!report && (
                <Card>
                    <CardContent className="py-8 text-center text-fg-muted text-sm">
                        Belum ada hasil scan di session ini. Klik <span className="text-fg font-medium">Scan Sekarang</span> untuk mulai,
                        atau tunggu cycle otomatis berikutnya.
                    </CardContent>
                </Card>
            )}

            {report && items.length === 0 && (
                <Card>
                    <CardContent className="py-8 text-center">
                        <ShieldCheck className="w-12 h-12 text-emerald-400 mx-auto mb-2" />
                        <p className="text-fg font-medium">Semua PPPoE sinkron</p>
                        <p className="text-fg-muted text-xs mt-1">
                            {report.subscriptionsChecked} subscription dicek di {report.routersScanned} router. Tidak ada drift.
                        </p>
                    </CardContent>
                </Card>
            )}

            {Object.entries(groupedByRouter).map(([routerId, group]) => (
                <Card key={routerId}>
                    <CardHeader>
                        <CardTitle className="text-sm">
                            <span className="text-primary">{group.routerName}</span>
                            <span className="text-fg-muted ml-2 text-xs font-normal">
                                {group.items.length} drift
                            </span>
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        {group.items.map(item => {
                            const isOpen = expanded[item.subscriptionId];
                            return (
                                <div key={item.subscriptionId}
                                    className="border border-slate-border rounded-lg overflow-hidden">
                                    <button
                                        onClick={() => setExpanded(s => ({ ...s, [item.subscriptionId]: !isOpen }))}
                                        className="w-full flex items-start gap-2 p-3 hover:bg-white/5 text-left">
                                        {isOpen ? <ChevronDown className="w-4 h-4 text-fg-muted mt-0.5 shrink-0" />
                                            : <ChevronRight className="w-4 h-4 text-fg-muted mt-0.5 shrink-0" />}
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-baseline gap-2 flex-wrap">
                                                <span className="font-mono text-sm text-fg">{item.mikrotikIdentity}</span>
                                                {item.customerName && (
                                                    <span className="text-xs text-fg-muted">— {item.customerName}</span>
                                                )}
                                                <span className={clsx(
                                                    'text-[10px] px-1.5 py-0.5 rounded uppercase font-bold',
                                                    item.subscriptionStatus === 'isolir' ? 'bg-red-500/10 text-red-400' : 'bg-emerald-500/10 text-emerald-400'
                                                )}>{item.subscriptionStatus}</span>
                                            </div>
                                            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                                {item.driftFields.map(f => (
                                                    <span key={f} className={clsx(
                                                        'text-[10px] px-1.5 py-0.5 rounded border',
                                                        FIELD_BADGE[f] || 'bg-slate-500/10 text-slate-400 border-slate-500/30'
                                                    )}>{FIELD_LABEL[f] || f}</span>
                                                ))}
                                            </div>
                                        </div>
                                        <Button
                                            size="sm"
                                            onClick={(e) => { e.stopPropagation(); setConfirmRow({ item, kickSession: item.driftFields.includes('profile') }); }}
                                            disabled={item.driftFields.includes('missing')}
                                            title={item.driftFields.includes('missing') ? 'PPP secret tidak ada di router — buat manual dulu' : 'Push state DB ke MikroTik'}
                                        >
                                            Resync ke DB
                                        </Button>
                                    </button>

                                    {isOpen && (
                                        <div className="border-t border-slate-border p-3 bg-black/20 grid sm:grid-cols-2 gap-3 text-xs">
                                            <div>
                                                <div className="text-[10px] uppercase text-fg-muted font-bold tracking-wider mb-1">DB (Expected)</div>
                                                <DiffRow label="Profile" value={item.expected.profile} />
                                                <DiffRow label="Disabled" value={String(item.expected.disabled)} />
                                                <DiffRow label="Comment" value={item.expected.comment} mono wrap />
                                            </div>
                                            <div>
                                                <div className="text-[10px] uppercase text-fg-muted font-bold tracking-wider mb-1">MikroTik (Actual)</div>
                                                {!item.actual.exists ? (
                                                    <p className="text-red-400 text-xs italic">PPP secret tidak ditemukan di router.</p>
                                                ) : (
                                                    <>
                                                        <DiffRow label="Profile" value={item.actual.profile || '(kosong)'} highlight={item.driftFields.includes('profile')} />
                                                        <DiffRow label="Disabled" value={String(item.actual.disabled)} highlight={item.driftFields.includes('disabled')} />
                                                        <DiffRow label="Comment" value={item.actual.comment || '(kosong)'} mono wrap highlight={item.driftFields.includes('comment')} />
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </CardContent>
                </Card>
            ))}

            {confirmRow && (
                <ConfirmModal
                    item={confirmRow.item}
                    kickSession={confirmRow.kickSession}
                    setKickSession={(v) => setConfirmRow(s => ({ ...s, kickSession: v }))}
                    onCancel={() => setConfirmRow(null)}
                    onConfirm={handleResync}
                    loading={resync.isPending}
                />
            )}
        </div>
    );
}

function Stat({ label, value, tone, small }) {
    const toneCls = tone === 'warn' ? 'text-amber-400'
        : tone === 'ok' ? 'text-emerald-400'
        : 'text-fg';
    return (
        <div className="rounded-lg border border-slate-border bg-surface-dark/40 p-3">
            <div className="text-[10px] uppercase text-fg-muted font-bold tracking-wider">{label}</div>
            <div className={clsx(small ? 'text-sm mt-0.5' : 'text-2xl font-bold mt-1', toneCls)}>{value}</div>
        </div>
    );
}

function DiffRow({ label, value, mono, wrap, highlight }) {
    return (
        <div className={clsx('flex items-baseline gap-2 mb-1.5', highlight && 'bg-amber-500/5 -mx-1 px-1 rounded')}>
            <span className="text-fg-muted text-[10px] uppercase w-16 shrink-0">{label}</span>
            <span className={clsx(
                'text-fg',
                mono && 'font-mono text-[11px]',
                wrap ? 'break-all' : 'truncate'
            )}>{value}</span>
        </div>
    );
}

function ConfirmModal({ item, kickSession, setKickSession, onCancel, onConfirm, loading }) {
    return (
        <div className="fixed inset-0 z-[1000] bg-black/70 backdrop-blur-sm flex items-center justify-center p-3"
            onClick={onCancel}>
            <div className="w-full max-w-md bg-surface-dark border border-slate-border rounded-xl shadow-2xl"
                onClick={e => e.stopPropagation()}>
                <div className="px-5 py-3 border-b border-slate-border">
                    <h3 className="font-semibold text-fg text-base flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-400" />
                        Konfirmasi Resync
                    </h3>
                </div>
                <div className="px-5 py-4 space-y-3 text-sm">
                    <p className="text-fg-muted">
                        Akan push state DB ke MikroTik untuk customer:
                    </p>
                    <div className="bg-black/30 border border-slate-border rounded-lg p-3">
                        <div className="font-mono text-fg">{item.mikrotikIdentity}</div>
                        {item.customerName && <div className="text-fg-muted text-xs">{item.customerName}</div>}
                        <div className="mt-2 text-xs text-fg-muted">
                            Field yang akan di-overwrite:{' '}
                            {item.driftFields.map(f => (
                                <code key={f} className="mr-1 px-1.5 py-0.5 bg-amber-500/10 text-amber-400 rounded">{FIELD_LABEL[f] || f}</code>
                            ))}
                        </div>
                    </div>
                    {item.driftFields.includes('profile') && (
                        <label className="flex items-start gap-2 cursor-pointer text-xs">
                            <input type="checkbox"
                                checked={kickSession}
                                onChange={e => setKickSession(e.target.checked)}
                                className="mt-0.5" />
                            <span>
                                Kick session aktif setelah ganti profile.
                                <span className="block text-fg-muted">
                                    Customer akan disconnect & dial ulang — rate-limit baru langsung berlaku.
                                </span>
                            </span>
                        </label>
                    )}
                </div>
                <div className="px-5 py-3 border-t border-slate-border flex justify-end gap-2">
                    <Button variant="ghost" onClick={onCancel} disabled={loading}>Batal</Button>
                    <Button onClick={onConfirm} loading={loading}>Push ke MikroTik</Button>
                </div>
            </div>
        </div>
    );
}
