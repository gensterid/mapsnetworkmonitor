import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { MessageSquare, Send, RefreshCw } from 'lucide-react';
import clsx from 'clsx';
import {
    useRouters, useWaLog, useWaTest,
    useCommentAudit, useResyncComment,
    useMikrotikPppProfiles, useCreatePppProfile,
    useIsolirFirewallStatus, useSetupIsolirFirewall,
    useBillingSchedulerStatus, useSetupBillingScheduler,
} from '@/hooks';
import toast from 'react-hot-toast';
import { fmtDateTime, Modal, Field, inputCls } from './helpers';

// ─── WA & MikroTik Tools tab ───────────────────────────────────────────────
export default function WaTab() {
    const { data: routers = [] } = useRouters();
    const { data: log = [], refetch, isRefetching } = useWaLog(200);
    const test = useWaTest();
    const [modal, setModal] = useState(false);

    const handleTest = async (e) => {
        e.preventDefault();
        const f = new FormData(e.target);
        await test.mutateAsync({
            routerId: f.get('routerId'),
            phone: f.get('phone'),
            message: f.get('message') || undefined,
        });
        setModal(false);
    };

    return (
        <div className="space-y-4">
            <Card>
                <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4">
                    <CardTitle className="text-base flex items-center gap-2"><MessageSquare className="w-5 h-5 text-primary" /> Riwayat Notifikasi WA</CardTitle>
                    <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => refetch()}><RefreshCw className={clsx('w-4 h-4', isRefetching && 'animate-spin')} /></Button>
                        <Button size="sm" onClick={() => setModal(true)}><Send className="w-4 h-4 mr-1" /> Tes Kirim</Button>
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm min-w-[640px]">
                            <thead className="bg-surface-dark/50 text-xs text-fg-muted uppercase">
                                <tr><th className="text-left px-4 py-2">Waktu</th><th className="text-left px-4 py-2">Pelanggan</th><th className="text-left px-4 py-2">HP</th><th className="text-left px-4 py-2">Tipe</th><th className="text-left px-4 py-2">Provider</th><th className="text-left px-4 py-2">Status</th><th className="text-left px-4 py-2">Error</th></tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800">
                                {log.length === 0 ? <tr><td colSpan={7} className="px-4 py-6 text-center text-fg-muted">Belum ada notifikasi terkirim</td></tr> : log.map(l => (
                                    <tr key={l.id} className="hover:bg-slate-surface/30">
                                        <td className="px-4 py-2 text-fg-muted text-xs">{fmtDateTime(l.sent_at || l.created_at)}</td>
                                        <td className="px-4 py-2 text-fg">{l.customer_name || '—'} {l.customer_code && <span className="text-xs text-fg-muted font-mono">({l.customer_code})</span>}</td>
                                        <td className="px-4 py-2 font-mono text-fg-muted">{l.to_phone}</td>
                                        <td className="px-4 py-2 text-xs"><span className="px-2 py-0.5 rounded bg-slate-surface text-fg uppercase">{l.type}</span></td>
                                        <td className="px-4 py-2 text-fg-muted text-xs">{l.provider}</td>
                                        <td className="px-4 py-2">
                                            <span className={clsx('text-xs px-2 py-0.5 rounded uppercase font-semibold',
                                                l.status === 'sent' ? 'bg-emerald-500/20 text-emerald-400' :
                                                l.status === 'failed' ? 'bg-red-500/20 text-red-400' :
                                                'bg-amber-500/20 text-amber-400')}>{l.status}</span>
                                        </td>
                                        <td className="px-4 py-2 text-red-400 text-xs max-w-xs truncate">{l.error || ''}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>

            <Modal open={modal} onClose={() => setModal(false)} title="Tes Kirim WA" footer={<>
                <Button variant="ghost" onClick={() => setModal(false)}>Batal</Button>
                <Button form="wa-test-form" type="submit" loading={test.isPending}>Kirim</Button>
            </>}>
                <form id="wa-test-form" onSubmit={handleTest}>
                    <Field label="Router (mengambil konfigurasi WA)">
                        <select name="routerId" required className={inputCls}>
                            <option value="">Pilih…</option>
                            {routers.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                        </select>
                    </Field>
                    <Field label="Nomor HP tujuan (+62 atau 08…)"><input name="phone" required className={inputCls} placeholder="08123456789" /></Field>
                    <Field label="Pesan (opsional, default: pesan tes)"><textarea name="message" className={inputCls} rows={3} placeholder="Pesan tes dari sistem billing." /></Field>
                </form>
            </Modal>
        </div>
    );
}

// ─── Profile picker (dropdown dari MikroTik + opsi buat baru) ──────────────
function IsolirProfilePicker({ routerId, currentValue }) {
    const { data: profiles = [], isLoading, refetch, isRefetching } = useMikrotikPppProfiles(routerId);
    const create = useCreatePppProfile();
    const [creating, setCreating] = useState(false);

    const exists = profiles.some(p => p.name === currentValue);

    const handleCreate = async (e) => {
        e.preventDefault();
        const f = new FormData(e.target);
        try {
            await create.mutateAsync({
                routerId,
                name: f.get('name'),
                rateLimit: f.get('rateLimit') || undefined,
                addressList: f.get('addressList') || undefined,
                onlyOne: 'yes',
                comment: 'auto-billing-isolir',
            });
            setCreating(false);
            refetch();
        } catch {}
    };

    return (
        <div>
            <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-fg-muted uppercase tracking-wide">Profile Isolir</span>
                <button type="button" onClick={() => refetch()} className="text-xs text-fg-muted hover:text-fg flex items-center gap-1">
                    <RefreshCw className={clsx('w-3 h-3', isRefetching && 'animate-spin')} /> {isLoading ? 'memuat…' : `${profiles.length} profile di router`}
                </button>
            </div>
            <select name="isolirProfile" defaultValue={currentValue} className={inputCls}>
                {!exists && <option value={currentValue}>{currentValue} ⚠ (tidak ada di router)</option>}
                {profiles.map(p => <option key={p.id} value={p.name}>{p.name} {p.rateLimit ? `— ${p.rateLimit}` : ''}</option>)}
                {profiles.length === 0 && <option value={currentValue}>{currentValue}</option>}
            </select>
            <button type="button" onClick={() => setCreating(c => !c)} className="text-xs text-primary hover:underline mt-1">
                {creating ? 'Batal' : '+ Buat profile isolir baru di MikroTik'}
            </button>

            {creating && (
                <div className="bg-slate-surface/50 border border-slate-border rounded-lg p-3 mt-2 space-y-2" onClick={e => e.stopPropagation()}>
                    <p className="text-xs text-fg-muted">Sistem akan menjalankan <code>/ppp profile add</code> di router. Konfigurasi default sudah cocok untuk isolir umum.</p>
                    <form onSubmit={handleCreate}>
                        <Field label="Nama Profile"><input name="name" defaultValue="pppoe-isolir" required className={inputCls} /></Field>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <Field label="Rate Limit (mis. 256k/256k)"><input name="rateLimit" defaultValue="256k/256k" className={inputCls} /></Field>
                            <Field label="Address List (untuk redirect)"><input name="addressList" defaultValue="isolir" className={inputCls} /></Field>
                        </div>
                        <div className="flex justify-end gap-2 mt-2">
                            <Button type="button" size="sm" variant="ghost" onClick={() => setCreating(false)}>Batal</Button>
                            <Button type="submit" size="sm" loading={create.isPending}>Buat di MikroTik</Button>
                        </div>
                    </form>
                </div>
            )}
        </div>
    );
}

// ─── Comment audit (deteksi typo / manual edit operator) ──────────────────
export function CommentAuditCard({ routerId }) {
    const { data, refetch, isFetching } = useCommentAudit(routerId);
    const resync = useResyncComment();

    if (!routerId) return null;
    const issues = data?.issues || [];

    const labelFor = (k) => {
        switch (k) {
            case 'missing-dn': return 'Tanpa dn:';
            case 'mismatched-dn': return 'dn ≠ DB';
            case 'inconsistent-due-vs-dn': return 'due ≠ dn (typo)';
            case 'orphan-mikrotik': return 'Orphan di router';
            default: return k;
        }
    };

    return (
        <div className="bg-slate-surface/30 border border-slate-border rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between">
                <div>
                    <div className="text-xs font-semibold text-fg-muted uppercase">Audit Comment di Router</div>
                    <p className="text-xs text-fg-muted mt-0.5">
                        Deteksi typo / edit manual operator di winbox. Klik "Resync" untuk paksa sistem menulis ulang.
                    </p>
                </div>
                <button type="button" onClick={() => refetch()} className="text-xs text-fg-muted hover:text-fg flex items-center gap-1">
                    <RefreshCw className={clsx('w-3 h-3', isFetching && 'animate-spin')} /> scan
                </button>
            </div>

            {data && (
                <div className="text-xs text-fg-muted">
                    {data.totalSecrets} secret di router • {data.totalSubs} subscription di DB •{' '}
                    {issues.length === 0 ? (
                        <span className="text-emerald-400 font-semibold">semua konsisten ✓</span>
                    ) : (
                        <span className="text-amber-400 font-semibold">{issues.length} issue ditemukan</span>
                    )}
                </div>
            )}

            {issues.length > 0 && (
                <div className="max-h-60 overflow-y-auto border border-slate-border rounded bg-surface-dark/40">
                    <table className="w-full text-xs">
                        <thead className="bg-surface-dark sticky top-0 text-fg-muted uppercase">
                            <tr>
                                <th className="text-left px-2 py-1">Username</th>
                                <th className="text-left px-2 py-1">Issue</th>
                                <th className="text-left px-2 py-1">Saat ini</th>
                                <th className="text-left px-2 py-1">Seharusnya</th>
                                <th className="px-2 py-1"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800">
                            {issues.map((i, idx) => (
                                <tr key={idx} className="hover:bg-slate-surface/50">
                                    <td className="px-2 py-1 font-mono text-blue-400">{i.name}</td>
                                    <td className="px-2 py-1">
                                        <span className="bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded">{labelFor(i.kind)}</span>
                                    </td>
                                    <td className="px-2 py-1 font-mono text-fg-muted">{i.current || '—'}</td>
                                    <td className="px-2 py-1 font-mono text-emerald-400">{i.expected || '—'}</td>
                                    <td className="px-2 py-1 text-right">
                                        {i.subscriptionId ? (
                                            <button type="button" onClick={() => resync.mutate(i.subscriptionId)} className="text-primary hover:underline">Resync</button>
                                        ) : (
                                            <span className="text-fg-muted text-[10px]">orphan</span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}

// ─── Field: window jam isolir ──────────────────────────────────────────────
function IsolirWindowField({ defaultStart, defaultEnd }) {
    const [start, setStart] = useState(defaultStart);
    const [end, setEnd] = useState(defaultEnd);
    const hours = Array.from({ length: 24 }, (_, i) => i);
    const fmt = (h) => `${String(h).padStart(2, '0')}:00`;
    const wraps = end < start;
    return (
        <div>
            <label className="block text-xs font-medium text-fg-muted mb-1">
                Window jam cek isolir
            </label>
            <div className="flex items-center gap-2">
                <select name="isolirCheckStartHour" value={start} onChange={(e) => setStart(Number(e.target.value))}
                    className={inputCls + ' flex-1'}>
                    {hours.map(h => <option key={h} value={h}>{fmt(h)}</option>)}
                </select>
                <span className="text-fg-muted text-xs">sampai</span>
                <select name="isolirCheckEndHour" value={end} onChange={(e) => setEnd(Number(e.target.value))}
                    className={inputCls + ' flex-1'}>
                    {hours.map(h => <option key={h} value={h}>{fmt(h)}</option>)}
                </select>
            </div>
            <p className="text-[11px] text-fg-muted mt-1">
                Customer hanya akan di-isolir kalau jam saat ini di antara <span className="text-fg">{fmt(start)}</span> dan <span className="text-fg">{fmt(end)}</span>.
                {' '}Di luar window itu, scheduler skip (app & MikroTik). Default 08:00 – 17:00 supaya tidak isolir tengah malam.
                {wraps && <span className="block text-amber-400 mt-0.5">Window wrap melewati tengah malam ({fmt(start)} – 23:00 lalu 00:00 – {fmt(end)}).</span>}
            </p>
        </div>
    );
}

// ─── Master billing scheduler (resilient isolir) ───────────────────────────
function BillingSchedulerCard({ routerId, isolirProfile, startHour, endHour }) {
    const { data: status, refetch, isFetching } = useBillingSchedulerStatus(routerId);
    const setup = useSetupBillingScheduler();
    const [interval, setInterval_] = useState('1h');

    if (!routerId) return null;

    const handleSetup = async () => {
        await setup.mutateAsync({
            routerId,
            isolirProfile: isolirProfile || 'pppoe-isolir',
            interval,
            startHour, endHour,
        });
        refetch();
    };
    const fmtH = (h) => `${String(h ?? 0).padStart(2, '0')}:00`;

    return (
        <div className="bg-slate-surface/30 border border-slate-border rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between">
                <div>
                    <div className="text-xs font-semibold text-fg-muted uppercase">Scheduler Auto-Isolir di Router</div>
                    <p className="text-xs text-fg-muted mt-0.5">
                        1 scheduler entry yang scan semua /ppp secret tiap interval. Tetap jalan walau server aplikasi down.
                    </p>
                </div>
                <button type="button" onClick={() => refetch()} className="text-xs text-fg-muted hover:text-fg flex items-center gap-1">
                    <RefreshCw className={clsx('w-3 h-3', isFetching && 'animate-spin')} /> cek
                </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                <div className="bg-surface-dark/50 border border-slate-border rounded p-2">
                    <div className="text-fg-muted uppercase text-[10px]">Status</div>
                    <div className={status?.present ? 'text-emerald-400 font-semibold' : 'text-fg-muted'}>
                        {status?.present ? '✓ Terpasang' : '— Belum'}
                    </div>
                </div>
                <div className="bg-surface-dark/50 border border-slate-border rounded p-2">
                    <div className="text-fg-muted uppercase text-[10px]">Interval</div>
                    <div className="text-fg">{status?.interval || '—'}</div>
                </div>
                <div className="bg-surface-dark/50 border border-slate-border rounded p-2">
                    <div className="text-fg-muted uppercase text-[10px]">Run Count</div>
                    <div className="text-fg">{status?.runCount || '—'}</div>
                </div>
            </div>

            <div className="flex items-center gap-2">
                <Field label="Interval (cth: 1h, 30m, 6h)">
                    <input value={interval} onChange={(e) => setInterval_(e.target.value)} className={inputCls} placeholder="1h" />
                </Field>
            </div>

            <Button size="sm" type="button" onClick={handleSetup} loading={setup.isPending}>
                {status?.present ? 'Update Scheduler di Router' : 'Pasang Scheduler di Router'}
            </Button>

            <div className="bg-blue-500/5 border border-blue-500/20 rounded p-2 text-[11px] text-fg-muted">
                <span className="text-blue-400 font-semibold">Window jam saat ini: </span>
                <span className="text-fg font-mono">{fmtH(startHour)} – {fmtH(endHour)}</span>
                {' '}— scheduler hanya isolir kalau jam router di antara range itu.
                Ubah di field <span className="text-fg">"Window jam cek isolir"</span> di atas, simpan, lalu klik Update Scheduler.
            </div>

            <p className="text-xs text-fg-muted">
                Scheduler app-managed baca field <code className="text-blue-400">dn:YYYYMMDD</code> dari comment tiap PPP secret.
                Sistem otomatis tulis comment ini saat buat / payment subscription dengan format:
            </p>
            <pre className="text-[10px] font-mono text-fg-muted bg-surface-darker border border-slate-border/40 rounded p-2 overflow-x-auto">
{`jun/06/2026 subscription:<uuid> dn:20260606 paket:Paket-10Mbps
└─11 char─┘                       └─8 digit─┘`}
            </pre>
            <p className="text-[10px] text-fg-muted">
                Format ini juga kompatibel dengan scheduler custom yang baca <code className="text-blue-400">[:pick comment 0 11]</code> sebagai
                tanggal mmm/dd/yyyy — bisa coexist tanpa konflik. Lihat <code>docs/PPPOE-ISOLIR-HYBRID.md</code> di repo untuk detail.
            </p>
        </div>
    );
}

// ─── Firewall isolir auto-setup ────────────────────────────────────────────
export function IsolirFirewallSetup({ routerId }) {
    const { data: status, refetch, isFetching } = useIsolirFirewallStatus(routerId, 'isolir');
    const setup = useSetupIsolirFirewall();
    const [showSetup, setShowSetup] = useState(false);

    const handleSetup = async (e) => {
        e.preventDefault();
        const f = new FormData(e.target);
        try {
            await setup.mutateAsync({
                routerId,
                listName: f.get('listName') || 'isolir',
                redirectIp: f.get('redirectIp'),
                redirectPort: Number(f.get('redirectPort')) || 80,
                addWalledGarden: f.get('walled') === 'on',
            });
            setShowSetup(false);
            refetch();
        } catch {}
    };

    if (!routerId) return null;

    return (
        <div className="bg-slate-surface/30 border border-slate-border rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between">
                <div>
                    <div className="text-xs font-semibold text-fg-muted uppercase">Firewall Isolir di MikroTik</div>
                    <p className="text-xs text-fg-muted mt-0.5">Address-list, NAT redirect, dan walled-garden untuk redirect pelanggan isolir ke halaman tagihan.</p>
                </div>
                <button type="button" onClick={() => refetch()} className="text-xs text-fg-muted hover:text-fg">
                    {isFetching ? 'cek…' : 'refresh'}
                </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                <FwBadge label="Address List" ok={status?.addressListPresent} />
                <FwBadge label="NAT Redirect" ok={status?.natRedirectPresent} />
                <FwBadge label="Walled Garden" ok={status?.walledGardenPresent} />
            </div>

            {!status?.addressListPresent || !status?.natRedirectPresent ? (
                <button type="button" onClick={() => setShowSetup(s => !s)} className="text-xs text-primary hover:underline">
                    {showSetup ? 'Batal' : '+ Auto-setup firewall isolir'}
                </button>
            ) : (
                <p className="text-xs text-emerald-400">✓ Firewall isolir sudah lengkap di router ini.</p>
            )}

            {showSetup && (
                <form onSubmit={handleSetup} className="bg-surface-dark/50 border border-slate-border rounded p-3 space-y-2 mt-2">
                    <p className="text-xs text-fg-muted">Sistem akan menjalankan command MikroTik untuk membuat: address-list, NAT dst-nat tcp/80, dan (opsional) filter walled-garden.</p>
                    <Field label="Nama Address List"><input name="listName" defaultValue="isolir" className={inputCls} /></Field>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <Field label="IP halaman tagihan (di sisi LAN router)"><input name="redirectIp" required defaultValue="" placeholder="10.10.0.5" className={inputCls} /></Field>
                        <Field label="Port"><input name="redirectPort" type="number" defaultValue="80" className={inputCls} /></Field>
                    </div>
                    <label className="flex items-center gap-2 text-xs text-fg">
                        <input type="checkbox" name="walled" defaultChecked />
                        Tambah walled-garden (allow billing IP, drop traffic lain) — wajib supaya redirect bekerja
                    </label>
                    <div className="flex justify-end gap-2">
                        <Button type="button" size="sm" variant="ghost" onClick={() => setShowSetup(false)}>Batal</Button>
                        <Button type="submit" size="sm" loading={setup.isPending}>Setup Firewall</Button>
                    </div>
                </form>
            )}
        </div>
    );
}

function FwBadge({ label, ok }) {
    return (
        <div className={clsx('rounded p-2 border text-center',
            ok ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' :
                 'bg-slate-border/30 border-slate-border text-fg-muted')}>
            <div className="font-semibold uppercase text-[10px] tracking-wide">{label}</div>
            <div className="text-sm font-bold mt-0.5">{ok ? '✓ Ada' : '— Belum'}</div>
        </div>
    );
}

