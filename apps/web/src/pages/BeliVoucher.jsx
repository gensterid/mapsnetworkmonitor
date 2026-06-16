import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Wifi, Loader2, AlertCircle, ArrowRight, Clock, Tag } from 'lucide-react';

const fmtIDR = (v) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(Number(v) || 0);

const cycleLabel = (type, value) => {
    if (type === 'duration') {
        if (value >= 86400) return `${Math.round(value / 86400)} hari`;
        if (value >= 3600) return `${Math.round(value / 3600)} jam`;
        if (value >= 60) return `${Math.round(value / 60)} menit`;
        return `${value} detik`;
    }
    return 'Bulanan';
};

/**
 * Public landing page untuk pembelian voucher hotspot.
 * URL: /beli/:routerSlug (no auth)
 *
 * Flow:
 *   1. Fetch list paket hotspot router
 *   2. Customer pilih paket → modal input HP opsional
 *   3. POST create → terima paymentUrl + accessToken
 *   4. Redirect ke paymentUrl (gateway)
 */
export default function BeliVoucher() {
    const { routerSlug } = useParams();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [selectedPackage, setSelectedPackage] = useState(null);
    const [buyerPhone, setBuyerPhone] = useState('');
    const [creating, setCreating] = useState(false);

    useEffect(() => {
        fetch(`/api/portal/voucher-purchase/router/${routerSlug}`)
            .then(r => r.json())
            .then(j => {
                if (j.error) throw new Error(j.error);
                setData(j.data);
            })
            .catch(e => setError(e.message))
            .finally(() => setLoading(false));
    }, [routerSlug]);

    const handleBuy = async () => {
        if (!selectedPackage) return;
        setCreating(true);
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
            // Redirect ke payment URL gateway
            window.location.href = json.data.paymentUrl;
        } catch (e) {
            alert(`Gagal: ${e.message}`);
            setCreating(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-300">
                <Loader2 className="w-8 h-8 animate-spin" />
            </div>
        );
    }

    if (error || !data) {
        return (
            <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
                <div className="max-w-md w-full bg-slate-900 border border-red-500/30 rounded-xl p-6 text-center">
                    <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-3" />
                    <h2 className="text-xl font-bold text-red-400 mb-2">Tidak Tersedia</h2>
                    <p className="text-slate-400 text-sm">{error || 'Halaman ini tidak tersedia.'}</p>
                </div>
            </div>
        );
    }

    if (!data.supportsOnline) {
        return (
            <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
                <div className="max-w-md w-full bg-slate-900 border border-amber-500/30 rounded-xl p-6 text-center">
                    <Wifi className="w-12 h-12 text-amber-400 mx-auto mb-3" />
                    <h2 className="text-xl font-bold text-amber-400 mb-2">{data.router.name}</h2>
                    <p className="text-slate-400 text-sm">{data.unsupportedReason}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-950 text-slate-100">
            {/* Header */}
            <div className="bg-gradient-to-r from-blue-600 to-purple-600 px-4 py-8 text-center">
                <Wifi className="w-12 h-12 mx-auto mb-2" />
                <h1 className="text-2xl font-bold">{data.router.name}</h1>
                <p className="text-blue-100 text-sm mt-1">Beli voucher WiFi langsung di sini</p>
            </div>

            {/* Package list */}
            <div className="max-w-2xl mx-auto px-4 py-6 space-y-3">
                <h2 className="text-sm uppercase tracking-wider text-slate-400 font-semibold mb-2">Pilih Paket</h2>

                {data.packages.length === 0 ? (
                    <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 text-center text-slate-400">
                        Belum ada paket tersedia. Hubungi operator.
                    </div>
                ) : data.packages.map(pkg => (
                    <button
                        key={pkg.id}
                        onClick={() => setSelectedPackage(pkg)}
                        className="w-full bg-slate-900 hover:bg-slate-800 border border-slate-700 hover:border-blue-500 rounded-xl p-4 text-left transition-all group"
                    >
                        <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                                <h3 className="text-lg font-bold text-white">{pkg.name}</h3>
                                {pkg.description && <p className="text-sm text-slate-400 mt-0.5">{pkg.description}</p>}
                                <div className="flex items-center gap-3 mt-2 text-xs text-slate-300">
                                    <span className="flex items-center gap-1">
                                        <Clock className="w-3 h-3" /> {cycleLabel(pkg.cycleType, pkg.cycleValue)}
                                    </span>
                                    <span className="flex items-center gap-1">
                                        <Tag className="w-3 h-3" /> {pkg.mikrotikProfile}
                                    </span>
                                </div>
                            </div>
                            <div className="text-right shrink-0">
                                <div className="text-xl font-bold text-blue-400">{fmtIDR(pkg.price)}</div>
                                <ArrowRight className="w-5 h-5 text-slate-500 group-hover:text-blue-400 transition-colors ml-auto mt-1" />
                            </div>
                        </div>
                    </button>
                ))}
            </div>

            {/* Modal pilih paket */}
            {selectedPackage && (
                <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-3"
                    onClick={() => !creating && setSelectedPackage(null)}>
                    <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl"
                        onClick={e => e.stopPropagation()}>
                        <div className="px-5 py-4 border-b border-slate-800">
                            <h3 className="font-bold text-lg text-white">Konfirmasi Pembelian</h3>
                        </div>
                        <div className="px-5 py-4 space-y-4">
                            <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-3">
                                <div className="text-sm text-slate-400">Paket</div>
                                <div className="font-bold text-white">{selectedPackage.name}</div>
                                <div className="flex justify-between mt-2 text-sm">
                                    <span className="text-slate-400">Durasi: {cycleLabel(selectedPackage.cycleType, selectedPackage.cycleValue)}</span>
                                    <span className="text-xl font-bold text-blue-400">{fmtIDR(selectedPackage.price)}</span>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm text-slate-300 mb-1">
                                    Nomor HP <span className="text-slate-500 text-xs">(opsional, untuk kirim kode via WA)</span>
                                </label>
                                <input
                                    type="tel"
                                    value={buyerPhone}
                                    onChange={e => setBuyerPhone(e.target.value)}
                                    placeholder="0812xxxxxxx"
                                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                                />
                            </div>

                            <div className="text-xs text-slate-400">
                                Setelah klik Bayar, Anda akan diarahkan ke halaman pembayaran. Setelah bayar, kode voucher akan tampil di halaman sukses (dan dikirim ke WA kalau nomor diisi).
                            </div>
                        </div>
                        <div className="px-5 py-3 border-t border-slate-800 flex justify-end gap-2">
                            <button
                                disabled={creating}
                                onClick={() => setSelectedPackage(null)}
                                className="px-4 py-2 rounded-lg text-slate-300 hover:bg-slate-800 transition-colors"
                            >
                                Batal
                            </button>
                            <button
                                disabled={creating}
                                onClick={handleBuy}
                                className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold transition-colors flex items-center gap-2 disabled:opacity-60"
                            >
                                {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                                Bayar Sekarang
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
