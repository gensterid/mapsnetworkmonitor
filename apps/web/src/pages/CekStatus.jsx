import React, { useState } from 'react';
import { Search, Loader2, Wifi, AlertCircle, CheckCircle2, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

/**
 * Public status checker. No login. Customer types in PPPoE username (or
 * customer code) plus the last 4 digits of their phone — we return a
 * sanitised status summary.
 */
export default function CekStatus() {
    const [identity, setIdentity] = useState('');
    const [last4, setLast4] = useState('');
    const [data, setData] = useState(null);
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(false);

    const submit = async (e) => {
        e.preventDefault();
        setLoading(true); setError(null); setData(null);
        try {
            const res = await fetch('/api/portal/cekstatus', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ identity, last4 }),
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
            setData(json.data);
        } catch (e) { setError(e.message || 'Gagal memuat data'); }
        finally { setLoading(false); }
    };

    return (
        <div className="min-h-screen bg-[#020617] text-fg">
            <div className="max-w-2xl mx-auto px-4 py-12">
                <header className="text-center mb-10">
                    <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/20 border border-primary/30 mb-4">
                        <Wifi className="w-7 h-7 text-primary" />
                    </div>
                    <h1 className="text-2xl sm:text-3xl font-bold mb-2">Cek Status Layanan</h1>
                    <p className="text-fg-muted text-sm">Masukkan username PPPoE / kode pelanggan dan 4 digit terakhir nomor HP Anda.</p>
                </header>

                <form onSubmit={submit} className="bg-surface-dark/60 border border-slate-border rounded-xl p-4 sm:p-6 space-y-4">
                    <label className="block">
                        <span className="block text-xs font-semibold text-fg-muted uppercase tracking-wide mb-1">Username PPPoE / Kode Pelanggan</span>
                        <input value={identity} onChange={(e) => setIdentity(e.target.value)} required
                               className="w-full bg-slate-surface border border-slate-border rounded-lg px-4 py-2.5 text-fg focus:ring-1 focus:ring-primary"
                               placeholder="contoh: budi-home atau CUST-0042"
                               autoComplete="username"
                               autoCapitalize="none"
                               autoCorrect="off"
                               spellCheck="false"
                               autoFocus />
                    </label>
                    <label className="block">
                        <span className="block text-xs font-semibold text-fg-muted uppercase tracking-wide mb-1">4 Digit Terakhir HP</span>
                        <input value={last4} onChange={(e) => setLast4(e.target.value.replace(/\D/g, '').slice(0, 4))} required minLength={4} maxLength={4}
                               className="w-full bg-slate-surface border border-slate-border rounded-lg px-4 py-2.5 text-fg focus:ring-1 focus:ring-primary font-mono tracking-widest"
                               placeholder="1234"
                               inputMode="numeric"
                               autoComplete="off"
                               pattern="[0-9]*" />
                    </label>
                    <button type="submit" disabled={loading} className="w-full bg-primary hover:bg-primary/90 disabled:opacity-60 text-fg py-2.5 rounded-lg font-semibold flex items-center justify-center gap-2">
                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                        Cek Status
                    </button>
                </form>

                {error && (
                    <div className="mt-6 bg-red-500/10 border border-red-500/30 rounded-lg p-4 flex items-start gap-3">
                        <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                        <div>
                            <div className="font-semibold text-red-300">Tidak Ditemukan</div>
                            <div className="text-sm text-red-300/80">{error}</div>
                        </div>
                    </div>
                )}

                {data && (
                    <div className="mt-6 space-y-3">
                        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-4 flex items-start gap-3">
                            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                            <div>
                                <div className="font-semibold text-emerald-300">Data ditemukan</div>
                                <div className="text-sm text-fg">Pelanggan: <span className="font-semibold text-fg">{data.customer.name}</span> ({data.customer.code})</div>
                                {data.customer.phone && <div className="text-xs text-fg-muted">HP: {data.customer.phone}</div>}
                            </div>
                        </div>

                        {data.subscriptions.map((s, i) => (
                            <div key={i} className="bg-surface-dark/60 border border-slate-border rounded-lg p-4">
                                <div className="flex items-center justify-between mb-2">
                                    <div>
                                        <div className="text-xs text-fg-muted uppercase tracking-wide">{s.type}</div>
                                        <div className="font-mono text-blue-400">{s.identity}</div>
                                    </div>
                                    <span className={`text-xs px-2.5 py-1 rounded uppercase font-semibold ${
                                        s.status === 'active' ? 'bg-emerald-500/20 text-emerald-400' :
                                        s.status === 'isolir' ? 'bg-red-500/20 text-red-400' :
                                        s.status === 'expired' ? 'bg-amber-500/20 text-amber-400' :
                                        'bg-slate-500/20 text-fg-muted'
                                    }`}>{s.status}</span>
                                </div>
                                {s.packageName && <div className="text-sm text-fg">Paket: <span className="text-fg font-semibold">{s.packageName}</span></div>}
                                {s.statusReason && <div className="text-xs text-amber-400 mt-1">Catatan: {s.statusReason}</div>}
                                {s.expiresAt && <div className="text-xs text-fg-muted mt-1">Berakhir: {new Date(s.expiresAt).toLocaleString('id-ID')}</div>}
                                {s.nextDueAt && <div className="text-xs text-fg-muted mt-1">Tagihan berikut: {new Date(s.nextDueAt).toLocaleDateString('id-ID')}</div>}
                            </div>
                        ))}

                        <div className="text-center mt-4">
                            <Link to="/member" className="text-primary hover:text-primary/80 text-sm font-semibold inline-flex items-center gap-1">
                                Login ke Portal Pelanggan untuk lihat tagihan & bayar online →
                            </Link>
                        </div>
                    </div>
                )}

                <div className="text-center mt-8 text-xs text-slate-600">
                    Butuh bantuan? Hubungi operator Anda.
                </div>
            </div>
        </div>
    );
}
