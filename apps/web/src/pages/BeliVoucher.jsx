import React, { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { Wifi, Loader2, AlertCircle, ArrowUpRight, Tag, ShieldCheck, Lock } from 'lucide-react';

const fmtIDR = (v) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(Number(v) || 0);

/**
 * Validate URL untuk redirect — defense terhadap javascript: / data: scheme
 * injection (lihat rules/react/security.md).
 */
function isSafeUrl(url) {
    if (typeof url !== 'string' || !url) return false;
    try {
        const parsed = new URL(url);
        return parsed.protocol === 'https:' || parsed.protocol === 'http:';
    } catch {
        return false;
    }
}

/**
 * Public landing untuk pembelian voucher hotspot.
 * URL: /beli/:routerSlug (no auth)
 *
 * Design direction: Dark Luxury (apps/web/docs/DESIGN-SYSTEM.md)
 *   • Restraint: 1 accent (primary blue), 3 neutral surface layers
 *   • Hierarchy by size + weight, color tetap fg-strong
 *   • Subtle motion: 200ms ease-out, no bounce
 *   • Premium spacing: hero py-16, cards p-5, gap-3 between cards
 */
export default function BeliVoucher() {
    const { routerSlug } = useParams();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [selectedPackage, setSelectedPackage] = useState(null);
    const [buyerPhone, setBuyerPhone] = useState('');
    const [creating, setCreating] = useState(false);
    const [createError, setCreateError] = useState(null);

    // Fetch paket router. Pakai AbortController supaya kalau slug ganti
    // mid-flight, request lama tidak race condition (lihat rules/react/hooks.md).
    useEffect(() => {
        const controller = new AbortController();
        setLoading(true);
        setError(null);
        fetch(`/api/portal/voucher-purchase/router/${routerSlug}`, { signal: controller.signal })
            .then((r) => r.json())
            .then((j) => {
                if (j.error) throw new Error(j.error);
                setData(j.data);
            })
            .catch((e) => {
                if (e.name === 'AbortError') return;
                setError(e.message);
            })
            .finally(() => setLoading(false));
        return () => controller.abort();
    }, [routerSlug]);

    const handleBuy = useCallback(async () => {
        if (!selectedPackage) return;
        setCreating(true);
        setCreateError(null);
        try {
            const res = await fetch('/api/portal/voucher-purchase/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    routerSlug,
                    packageId: selectedPackage.id,
                    buyerPhone: buyerPhone.trim() || null,
                }),
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
            const paymentUrl = json?.data?.paymentUrl;
            if (!isSafeUrl(paymentUrl)) {
                throw new Error('URL pembayaran tidak valid');
            }
            window.location.href = paymentUrl;
        } catch (e) {
            setCreateError(e.message || 'Gagal memproses pembayaran');
            setCreating(false);
        }
    }, [routerSlug, selectedPackage, buyerPhone]);

    if (loading) return <LoadingState />;
    if (error || !data) return <ErrorState message={error || 'Halaman ini tidak tersedia.'} />;
    if (!data.supportsOnline) return <UnsupportedState routerName={data.router.name} reason={data.unsupportedReason} />;

    return (
        <div className="min-h-screen bg-slate-950 text-slate-100 selection:bg-blue-500/30">
            <Hero routerName={data.router.name} />

            <main className="max-w-2xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
                <SectionLabel>Pilih Paket</SectionLabel>

                {data.packages.length === 0 ? (
                    <EmptyState />
                ) : (
                    <ul className="space-y-3" role="list">
                        {data.packages.map((pkg) => (
                            <li key={pkg.id}>
                                <PackageCard pkg={pkg} onSelect={setSelectedPackage} />
                            </li>
                        ))}
                    </ul>
                )}

                <Footer />
            </main>

            {selectedPackage && (
                <ConfirmModal
                    pkg={selectedPackage}
                    phone={buyerPhone}
                    onPhoneChange={setBuyerPhone}
                    creating={creating}
                    error={createError}
                    onCancel={() => {
                        if (creating) return;
                        setSelectedPackage(null);
                        setCreateError(null);
                    }}
                    onConfirm={handleBuy}
                />
            )}
        </div>
    );
}

/* ─── State views ─────────────────────────────────────────────────────── */

function LoadingState() {
    return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center">
            <div className="flex flex-col items-center gap-3 text-slate-500">
                <Loader2 className="w-6 h-6 animate-spin" aria-hidden="true" />
                <span className="text-xs uppercase tracking-widest">Memuat</span>
            </div>
        </div>
    );
}

function ErrorState({ message }) {
    return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4">
            <div className="max-w-md w-full">
                <div className="bg-slate-900/60 border border-red-500/20 rounded-2xl p-8 text-center backdrop-blur-sm">
                    <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-red-500/10 mb-4">
                        <AlertCircle className="w-6 h-6 text-red-400" aria-hidden="true" />
                    </div>
                    <h2 className="text-lg font-semibold text-slate-100 mb-1.5">Tidak Tersedia</h2>
                    <p className="text-sm text-slate-400 leading-relaxed">{message}</p>
                </div>
            </div>
        </div>
    );
}

function UnsupportedState({ routerName, reason }) {
    return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4">
            <div className="max-w-md w-full">
                <div className="bg-slate-900/60 border border-amber-500/20 rounded-2xl p-8 text-center backdrop-blur-sm">
                    <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-amber-500/10 mb-4">
                        <Wifi className="w-6 h-6 text-amber-400" aria-hidden="true" />
                    </div>
                    <p className="text-xs uppercase tracking-widest text-amber-400/80 mb-1">Router</p>
                    <h2 className="text-lg font-semibold text-slate-100 mb-2">{routerName}</h2>
                    <p className="text-sm text-slate-400 leading-relaxed">{reason}</p>
                </div>
            </div>
        </div>
    );
}

function EmptyState() {
    return (
        <div className="bg-slate-900/40 border border-slate-800 rounded-2xl px-6 py-10 text-center">
            <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-slate-800/80 mb-3">
                <Tag className="w-5 h-5 text-slate-500" aria-hidden="true" />
            </div>
            <p className="text-sm text-slate-400">
                Belum ada paket tersedia.
                <br />
                <span className="text-slate-500 text-xs">Silakan hubungi operator.</span>
            </p>
        </div>
    );
}

/* ─── Layout sections ─────────────────────────────────────────────────── */

function Hero({ routerName }) {
    return (
        <header className="relative overflow-hidden border-b border-slate-800/60">
            {/* Subtle gradient backdrop — premium, not vibrant */}
            <div
                className="absolute inset-0 bg-gradient-to-b from-blue-500/10 via-slate-950 to-slate-950"
                aria-hidden="true"
            />
            <div
                className="absolute top-0 left-1/2 -translate-x-1/2 w-[480px] h-[480px] bg-blue-500/10 rounded-full blur-[120px]"
                aria-hidden="true"
            />

            <div className="relative max-w-2xl mx-auto px-4 sm:px-6 py-14 sm:py-20 text-center">
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-blue-500/15 ring-1 ring-blue-500/30 mb-5">
                    <Wifi className="w-7 h-7 text-blue-400" aria-hidden="true" />
                </div>
                <p className="text-xs uppercase tracking-[0.2em] text-blue-400/80 font-semibold mb-3">
                    WiFi Premium
                </p>
                <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-white mb-2">
                    {routerName}
                </h1>
                <p className="text-sm text-slate-400 max-w-sm mx-auto">
                    Beli voucher WiFi instan — bayar online, kode langsung di-kirim.
                </p>

                {/* Trust signals */}
                <div className="flex items-center justify-center gap-5 mt-7 text-[11px] text-slate-500">
                    <span className="flex items-center gap-1.5">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-500/80" aria-hidden="true" />
                        Pembayaran aman
                    </span>
                    <span className="text-slate-700">•</span>
                    <span className="flex items-center gap-1.5">
                        <Lock className="w-3.5 h-3.5 text-emerald-500/80" aria-hidden="true" />
                        Voucher otomatis
                    </span>
                </div>
            </div>
        </header>
    );
}

function SectionLabel({ children }) {
    return (
        <p className="text-[11px] uppercase tracking-widest text-slate-500 font-semibold mb-3 px-1">
            {children}
        </p>
    );
}

function Footer() {
    return (
        <footer className="mt-12 pt-8 border-t border-slate-800/60 text-center">
            <p className="text-[11px] text-slate-500">
                Pembayaran diproses oleh gateway terpercaya
            </p>
        </footer>
    );
}

/* ─── Package card ────────────────────────────────────────────────────── */

function PackageCard({ pkg, onSelect }) {
    return (
        <button
            type="button"
            onClick={() => onSelect(pkg)}
            className="group w-full text-left bg-slate-900/40 border border-slate-800 rounded-2xl p-5
                       hover:bg-slate-900/70 hover:border-blue-500/40
                       hover:shadow-[0_0_0_1px_rgb(59_130_246_/_0.1),0_10px_40px_-15px_rgb(59_130_246_/_0.3)]
                       transition-all duration-200 ease-out
                       active:scale-[0.99]
                       focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
            aria-label={`Beli ${pkg.name} ${fmtIDR(pkg.price)}`}
        >
            <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                    <h3 className="text-base sm:text-lg font-semibold text-white tracking-tight">{pkg.name}</h3>
                    {pkg.description && (
                        <p className="text-sm text-slate-400 mt-1 line-clamp-2">{pkg.description}</p>
                    )}
                    <div className="flex items-center gap-1.5 mt-3 text-xs text-slate-500">
                        <Tag className="w-3 h-3" aria-hidden="true" />
                        <span className="font-mono">{pkg.mikrotikProfile}</span>
                    </div>
                </div>
                <div className="text-right shrink-0">
                    <div className="text-xl sm:text-2xl font-bold text-white tracking-tight">{fmtIDR(pkg.price)}</div>
                    <div className="flex items-center justify-end gap-1 mt-1 text-xs text-slate-500 group-hover:text-blue-400 transition-colors duration-200">
                        <span>Beli</span>
                        <ArrowUpRight className="w-3.5 h-3.5 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" aria-hidden="true" />
                    </div>
                </div>
            </div>
        </button>
    );
}

/* ─── Confirm Modal ───────────────────────────────────────────────────── */

function ConfirmModal({ pkg, phone, onPhoneChange, creating, error, onCancel, onConfirm }) {
    // Esc to close (if not creating)
    useEffect(() => {
        const handler = (e) => {
            if (e.key === 'Escape' && !creating) onCancel();
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [creating, onCancel]);

    return (
        <div
            className="dl-backdrop-in fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-end sm:items-center justify-center p-3"
            onClick={onCancel}
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
        >
            <div
                className="dl-card-in w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl shadow-blue-500/10"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="px-6 py-4 border-b border-slate-800/80">
                    <p className="text-[11px] uppercase tracking-widest text-blue-400/80 font-semibold">Konfirmasi</p>
                    <h2 id="confirm-title" className="text-lg font-semibold text-white mt-0.5">
                        Pembelian Voucher
                    </h2>
                </div>

                {/* Body */}
                <div className="px-6 py-5 space-y-5">
                    {/* Package summary */}
                    <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4">
                        <div className="text-[10px] uppercase tracking-widest text-slate-500 font-semibold mb-1">Paket</div>
                        <div className="font-semibold text-white text-base">{pkg.name}</div>
                        <div className="flex items-baseline justify-between mt-3 pt-3 border-t border-slate-800/60">
                            <span className="text-xs text-slate-500">
                                Profile: <span className="font-mono text-slate-400">{pkg.mikrotikProfile}</span>
                            </span>
                            <span className="text-xl font-bold text-white tracking-tight">{fmtIDR(pkg.price)}</span>
                        </div>
                    </div>

                    {/* Phone input */}
                    <div>
                        <label htmlFor="buyer-phone" className="flex items-baseline justify-between mb-1.5">
                            <span className="text-sm font-medium text-slate-200">Nomor HP</span>
                            <span className="text-[11px] text-slate-500">opsional · untuk WA</span>
                        </label>
                        <input
                            id="buyer-phone"
                            type="tel"
                            inputMode="numeric"
                            autoComplete="tel"
                            value={phone}
                            onChange={(e) => onPhoneChange(e.target.value)}
                            disabled={creating}
                            placeholder="0812xxxxxxx"
                            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3.5 py-2.5 text-sm text-white placeholder-slate-600
                                       focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20
                                       focus:outline-none transition-colors duration-200
                                       disabled:opacity-60"
                        />
                    </div>

                    {/* Info */}
                    <p className="text-[11px] text-slate-500 leading-relaxed">
                        Setelah klik <span className="text-slate-400">Bayar Sekarang</span>, Anda akan diarahkan
                        ke halaman pembayaran. Kode voucher tampil otomatis di halaman sukses
                        {phone.trim() ? ' dan dikirim ke WhatsApp.' : '.'}
                    </p>

                    {/* Error */}
                    {error && (
                        <div className="bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2.5 flex items-start gap-2">
                            <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" aria-hidden="true" />
                            <p className="text-xs text-red-300 leading-relaxed">{error}</p>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-slate-800/80 flex justify-end gap-2">
                    <button
                        type="button"
                        disabled={creating}
                        onClick={onCancel}
                        className="px-4 py-2 rounded-lg text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-800/60
                                   transition-colors duration-200 disabled:opacity-50"
                    >
                        Batal
                    </button>
                    <button
                        type="button"
                        disabled={creating}
                        onClick={onConfirm}
                        className="px-5 py-2 rounded-lg text-sm font-semibold text-white bg-blue-500 hover:bg-blue-400
                                   shadow-[0_4px_20px_-4px_rgb(59_130_246_/_0.5)]
                                   transition-all duration-200 active:scale-[0.98]
                                   focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900
                                   flex items-center gap-2 disabled:opacity-60 disabled:cursor-wait"
                    >
                        {creating && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
                        {creating ? 'Memproses…' : 'Bayar Sekarang'}
                    </button>
                </div>
            </div>
        </div>
    );
}
