import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { User as UserIcon, Loader2, LogOut, Receipt, Wifi, AlertCircle, CreditCard, Copy, ExternalLink, Ticket } from 'lucide-react';
import toast from 'react-hot-toast';

/**
 * Customer self-service portal — Phase F.
 *
 * Login flow:
 *   POST /api/portal/login { identity, pin } → { token, customer }
 *   Subsequent requests use Authorization: Portal <token>
 *   Token persisted in localStorage.member-token
 *
 * Pages:
 *   - Login form
 *   - Dashboard: profile + subscriptions + invoices + pay link
 */

const TOKEN_KEY = 'member-token';
const PROFILE_KEY = 'member-profile';

function getToken() { return localStorage.getItem(TOKEN_KEY); }
function setToken(t, profile) {
    localStorage.setItem(TOKEN_KEY, t);
    if (profile) localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
}
function clearToken() { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(PROFILE_KEY); }

async function portalFetch(url, opts = {}) {
    const token = getToken();
    const res = await fetch(url, {
        ...opts,
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Portal ${token}` } : {}),
            ...(opts.headers || {}),
        },
    });
    if (res.status === 401) { clearToken(); throw new Error('Sesi berakhir, silakan login ulang.'); }
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
    return json.data;
}

const fmtIDR = (v) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(Number(v) || 0);
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

// ─── Login screen ──────────────────────────────────────────────────────────

function LoginForm({ onLogin }) {
    const [identity, setIdentity] = useState('');
    const [pin, setPin] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const submit = async (e) => {
        e.preventDefault();
        setLoading(true); setError(null);
        try {
            const res = await fetch('/api/portal/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ identity, pin }),
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
            setToken(json.data.token, json.data.customer);
            onLogin();
        } catch (e) { setError(e.message); }
        finally { setLoading(false); }
    };

    return (
        <div className="min-h-screen bg-[#020617] text-fg flex items-center justify-center px-4">
            <div className="w-full max-w-sm">
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/20 border border-primary/30 mb-4">
                        <UserIcon className="w-7 h-7 text-primary" />
                    </div>
                    <h1 className="text-2xl font-bold">Portal Pelanggan</h1>
                    <p className="text-fg-muted text-sm mt-1">Cek tagihan & bayar online.</p>
                </div>

                <form onSubmit={submit} className="bg-surface-dark/60 border border-slate-border rounded-xl p-4 sm:p-6 space-y-4">
                    <label className="block">
                        <span className="block text-xs font-semibold text-fg-muted uppercase tracking-wide mb-1">Username / Kode Pelanggan</span>
                        <input value={identity} onChange={(e) => setIdentity(e.target.value)} required autoFocus
                               className="w-full bg-slate-surface border border-slate-border rounded-lg px-4 py-2.5 text-fg focus:ring-1 focus:ring-primary"
                               placeholder="budi-home / CUST-0042"
                               autoComplete="username"
                               autoCapitalize="none"
                               autoCorrect="off"
                               spellCheck="false" />
                    </label>
                    <label className="block">
                        <span className="block text-xs font-semibold text-fg-muted uppercase tracking-wide mb-1">PIN</span>
                        <input value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
                               required minLength={4} maxLength={8} type="password"
                               className="w-full bg-slate-surface border border-slate-border rounded-lg px-4 py-2.5 text-fg focus:ring-1 focus:ring-primary font-mono tracking-widest"
                               placeholder="••••"
                               inputMode="numeric"
                               pattern="[0-9]*"
                               autoComplete="current-password" />
                        <span className="text-xs text-fg-muted mt-1 block">Default PIN = 4 digit terakhir nomor HP</span>
                    </label>
                    <button type="submit" disabled={loading} className="w-full bg-primary hover:bg-primary/90 disabled:opacity-60 text-fg py-2.5 rounded-lg font-semibold flex items-center justify-center gap-2">
                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                        Login
                    </button>
                    {error && <div className="text-sm text-red-400 text-center">{error}</div>}
                </form>

                <div className="text-center mt-6">
                    <a href="/cekstatus" className="text-xs text-fg-muted hover:text-fg">Cek status cepat tanpa login →</a>
                </div>
            </div>
        </div>
    );
}

// ─── Dashboard ─────────────────────────────────────────────────────────────

function Dashboard() {
    const [profile, setProfile] = useState(null);
    const [invoices, setInvoices] = useState([]);
    const [vouchers, setVouchers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [linkTarget, setLinkTarget] = useState(null);
    const [linkResult, setLinkResult] = useState(null);
    const [creating, setCreating] = useState(false);

    const load = async () => {
        try {
            const [p, inv, vch] = await Promise.all([
                portalFetch('/api/portal/me'),
                portalFetch('/api/portal/me/invoices'),
                // Voucher endpoint may fail silently if customer has no hotspot
                // subscriptions or the route isn't deployed yet — never let it
                // block the rest of the dashboard.
                portalFetch('/api/portal/me/vouchers').catch(() => []),
            ]);
            setProfile(p);
            setInvoices(inv);
            setVouchers(Array.isArray(vch) ? vch : []);
        } catch (e) {
            setError(e.message);
            if (e.message.includes('berakhir')) {
                setTimeout(() => window.location.reload(), 1500);
            }
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

    const logout = () => { clearToken(); window.location.reload(); };

    const createLink = async (e) => {
        e.preventDefault();
        const f = new FormData(e.target);
        setCreating(true);
        try {
            const result = await portalFetch(`/api/portal/me/invoices/${linkTarget.id}/payment-link`, {
                method: 'POST',
                body: JSON.stringify({ gateway: f.get('gateway') }),
            });
            setLinkResult(result);
        } catch (e) { setError(e.message); }
        finally { setCreating(false); }
    };

    if (loading) return <div className="min-h-screen bg-[#020617] flex items-center justify-center text-fg-muted"><Loader2 className="w-6 h-6 animate-spin" /></div>;
    if (error) return (
        <div className="min-h-screen bg-[#020617] flex flex-col items-center justify-center p-4 text-center">
            <AlertCircle className="w-10 h-10 text-red-400 mb-3" />
            <p className="text-red-300 max-w-sm">{error}</p>
            <button onClick={logout} className="mt-4 text-sm text-fg-muted hover:text-fg">Kembali ke Login</button>
        </div>
    );

    const c = profile.customer;
    return (
        <div className="min-h-screen bg-[#020617] text-fg">
            <div className="max-w-3xl mx-auto px-4 py-6">
                <header className="flex items-center justify-between mb-6">
                    <div>
                        <div className="text-xs text-fg-muted uppercase tracking-wide">Halo,</div>
                        <h1 className="text-xl font-bold">{c.name}</h1>
                        <div className="text-xs text-fg-muted font-mono">{c.code}</div>
                    </div>
                    <button onClick={logout} className="text-fg-muted hover:text-red-400 text-sm flex items-center gap-1">
                        <LogOut className="w-4 h-4" /> Logout
                    </button>
                </header>

                <section className="space-y-3 mb-8">
                    <h2 className="text-sm font-semibold text-fg-muted uppercase tracking-wide flex items-center gap-2"><Wifi className="w-4 h-4" /> Layanan</h2>
                    {profile.subscriptions.length === 0 ? (
                        <div className="text-sm text-fg-muted bg-surface-dark/40 border border-slate-border rounded-lg p-4">Belum ada layanan aktif.</div>
                    ) : profile.subscriptions.map(s => (
                        <div key={s.id} className="bg-surface-dark/60 border border-slate-border rounded-lg p-3 sm:p-4">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                <div className="min-w-0 flex-1">
                                    <div className="text-xs text-fg-muted uppercase">{s.type}</div>
                                    <div className="font-mono text-blue-400 break-all">{s.identity}</div>
                                    {s.packageName && <div className="text-sm text-fg mt-1">{s.packageName} {s.price && <span className="text-emerald-400 font-mono">({fmtIDR(s.price)})</span>}</div>}
                                </div>
                                <span className={`text-xs px-2.5 py-1 rounded uppercase font-semibold self-start sm:self-auto ${
                                    s.status === 'active' ? 'bg-emerald-500/20 text-emerald-400' :
                                    s.status === 'isolir' ? 'bg-red-500/20 text-red-400' :
                                    s.status === 'expired' ? 'bg-amber-500/20 text-amber-400' :
                                    'bg-slate-500/20 text-fg-muted'
                                }`}>{s.status}</span>
                            </div>
                            {s.statusReason && <div className="text-xs text-amber-400 mt-2">{s.statusReason}</div>}
                            {s.nextDueAt && <div className="text-xs text-fg-muted mt-1">Tagihan berikut: {fmtDate(s.nextDueAt)}</div>}
                            {s.expiresAt && <div className="text-xs text-fg-muted mt-1">Berakhir: {fmtDate(s.expiresAt)}</div>}
                        </div>
                    ))}
                </section>

                {vouchers.length > 0 && (
                    <section className="mb-8">
                        <h2 className="text-sm font-semibold text-fg-muted uppercase tracking-wide flex items-center gap-2 mb-3"><Ticket className="w-4 h-4" /> Voucher Aktif</h2>
                        <div className="space-y-2">
                            {vouchers.map(v => (
                                <div key={v.id} className="bg-surface-dark/60 border border-slate-border rounded-lg p-3 sm:p-4">
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                        <div className="min-w-0 flex-1">
                                            <div className="text-xs text-fg-muted uppercase mb-1">Kode Voucher</div>
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="font-mono font-bold text-blue-400 text-lg tracking-wider break-all">{v.code}</span>
                                                <button
                                                    onClick={() => {
                                                        navigator.clipboard.writeText(v.code);
                                                        toast.success('Kode disalin');
                                                    }}
                                                    className="p-1 rounded text-fg-muted hover:text-slate-200 hover:bg-white/5"
                                                    title="Copy"
                                                >
                                                    <Copy className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                            {v.packageName && (
                                                <div className="text-sm text-fg mt-2">
                                                    {v.packageName}
                                                    {v.profile && v.profile !== v.packageName && <span className="text-fg-muted"> · {v.profile}</span>}
                                                </div>
                                            )}
                                            {v.expiresAt && (
                                                <div className="text-xs text-fg-muted mt-1">Berakhir: {fmtDate(v.expiresAt)}</div>
                                            )}
                                            {v.redeemedAt && !v.expiresAt && (
                                                <div className="text-xs text-fg-muted mt-1">Aktif sejak: {fmtDate(v.redeemedAt)}</div>
                                            )}
                                        </div>
                                        <span className={`text-xs px-2.5 py-1 rounded uppercase font-semibold self-start sm:self-auto ${
                                            v.status === 'active' || v.status === 'redeemed' ? 'bg-emerald-500/20 text-emerald-400' :
                                            v.status === 'expired' ? 'bg-amber-500/20 text-amber-400' :
                                            v.status === 'unused' ? 'bg-cyan-500/20 text-cyan-400' :
                                            'bg-slate-500/20 text-fg-muted'
                                        }`}>{v.status || '—'}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>
                )}

                <section>
                    <h2 className="text-sm font-semibold text-fg-muted uppercase tracking-wide flex items-center gap-2 mb-3"><Receipt className="w-4 h-4" /> Tagihan</h2>
                    {invoices.length === 0 ? (
                        <div className="text-sm text-fg-muted bg-surface-dark/40 border border-slate-border rounded-lg p-4">Belum ada tagihan.</div>
                    ) : (
                        <div className="space-y-2">
                            {invoices.map(i => (
                                <div key={i.id} className="bg-surface-dark/60 border border-slate-border rounded-lg p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2">
                                            <span className="font-mono text-blue-400 text-sm">{i.invoiceNumber}</span>
                                            <span className={`text-xs px-2 py-0.5 rounded uppercase font-semibold ${
                                                i.status === 'paid' ? 'bg-emerald-500/20 text-emerald-400' :
                                                i.status === 'overdue' ? 'bg-red-500/20 text-red-400' :
                                                i.status === 'unpaid' ? 'bg-amber-500/20 text-amber-400' :
                                                'bg-slate-500/20 text-fg-muted'
                                            }`}>{i.status}</span>
                                        </div>
                                        <div className="text-emerald-400 font-mono font-semibold mt-1">{fmtIDR(i.amount)}</div>
                                        <div className="text-xs text-fg-muted mt-0.5">Jatuh tempo: {fmtDate(i.dueAt)}</div>
                                    </div>
                                    {(i.status === 'unpaid' || i.status === 'overdue') && (
                                        <button onClick={() => { setLinkTarget(i); setLinkResult(null); }} className="bg-primary hover:bg-primary/90 text-fg text-sm px-3 py-1.5 rounded-lg flex items-center gap-1.5 whitespace-nowrap">
                                            <CreditCard className="w-3.5 h-3.5" /> Bayar
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </section>
            </div>

            {/* Payment link modal */}
            {linkTarget && (
                <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => { setLinkTarget(null); setLinkResult(null); }}>
                    <div className="bg-surface-dark border border-slate-border rounded-xl max-w-md w-full p-5" onClick={e => e.stopPropagation()}>
                        <h3 className="font-semibold text-fg mb-1">Bayar {linkTarget.invoiceNumber}</h3>
                        <p className="text-sm text-fg-muted mb-4">{fmtIDR(linkTarget.amount)}</p>
                        {!linkResult ? (
                            <form onSubmit={createLink} className="space-y-3">
                                <label className="block">
                                    <span className="block text-xs font-semibold text-fg-muted uppercase tracking-wide mb-1">Pilih Metode</span>
                                    <select name="gateway" defaultValue="tripay" className="w-full bg-slate-surface border border-slate-border rounded px-3 py-2 text-fg">
                                        <option value="tripay">Tripay (QRIS / VA / E-Wallet)</option>
                                        <option value="midtrans">Midtrans</option>
                                        <option value="xendit">Xendit</option>
                                    </select>
                                </label>
                                <div className="flex gap-2 justify-end">
                                    <button type="button" onClick={() => setLinkTarget(null)} className="px-3 py-1.5 text-sm text-fg-muted hover:text-fg">Batal</button>
                                    <button type="submit" disabled={creating} className="bg-primary hover:bg-primary/90 disabled:opacity-60 text-fg text-sm px-4 py-1.5 rounded-lg flex items-center gap-1.5">
                                        {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null} Buat Link
                                    </button>
                                </div>
                            </form>
                        ) : (
                            <div className="space-y-3">
                                <div className="bg-slate-surface rounded p-3">
                                    <div className="text-xs text-fg-muted mb-1">URL Pembayaran</div>
                                    <input readOnly value={linkResult.paymentUrl} className="w-full bg-surface-dark border border-slate-border rounded px-2 py-1.5 text-xs font-mono" />
                                </div>
                                <div className="flex gap-2 justify-end">
                                    <button onClick={() => { navigator.clipboard.writeText(linkResult.paymentUrl); }} className="text-sm text-fg-muted hover:text-fg px-3 py-1.5 flex items-center gap-1"><Copy className="w-3.5 h-3.5" /> Copy</button>
                                    <a href={linkResult.paymentUrl} target="_blank" rel="noreferrer" className="bg-primary hover:bg-primary/90 text-fg text-sm px-4 py-1.5 rounded-lg flex items-center gap-1.5"><ExternalLink className="w-3.5 h-3.5" /> Bayar Sekarang</a>
                                </div>
                                <p className="text-xs text-fg-muted">Status tagihan akan otomatis terupdate setelah pembayaran sukses.</p>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

// ─── Page root ─────────────────────────────────────────────────────────────

export default function Member() {
    const navigate = useNavigate();
    const [authed, setAuthed] = useState(!!getToken());

    return authed ? <Dashboard /> : <LoginForm onLogin={() => setAuthed(true)} />;
}
