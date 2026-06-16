import React, { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle2, Loader2, AlertCircle, Wifi, Copy, RefreshCw, Clock } from 'lucide-react';

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
 * Halaman sukses voucher purchase.
 * URL: /beli/sukses/:accessToken
 *
 * Polling status tiap 3 detik sampai status='fulfilled' atau 'failed'.
 */
export default function BeliVoucherSukses() {
    const { accessToken } = useParams();
    const [data, setData] = useState(null);
    const [error, setError] = useState(null);
    const [copied, setCopied] = useState(false);
    const pollRef = useRef(null);

    const fetchStatus = async () => {
        try {
            const res = await fetch(`/api/portal/voucher-purchase/status/${accessToken}`);
            const json = await res.json();
            if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
            setData(json.data);
            // Stop polling kalau sudah fulfilled atau failed
            if (json.data.status === 'fulfilled' || json.data.status === 'failed' || json.data.status === 'expired') {
                if (pollRef.current) {
                    clearInterval(pollRef.current);
                    pollRef.current = null;
                }
            }
        } catch (e) {
            setError(e.message);
        }
    };

    useEffect(() => {
        fetchStatus();
        pollRef.current = setInterval(fetchStatus, 3000);
        return () => { if (pollRef.current) clearInterval(pollRef.current); };
    }, [accessToken]);

    const copy = (text) => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    if (error) {
        return (
            <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
                <div className="max-w-md w-full bg-slate-900 border border-red-500/30 rounded-xl p-6 text-center">
                    <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-3" />
                    <h2 className="text-xl font-bold text-red-400 mb-2">Error</h2>
                    <p className="text-slate-400 text-sm">{error}</p>
                </div>
            </div>
        );
    }

    if (!data) {
        return (
            <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-300">
                <Loader2 className="w-8 h-8 animate-spin" />
            </div>
        );
    }

    // Status states
    if (data.status === 'pending') {
        return (
            <StatusCard
                tone="info"
                icon={<Clock className="w-12 h-12 text-blue-400 animate-pulse" />}
                title="Menunggu Pembayaran..."
                description="Selesaikan pembayaran di halaman gateway. Halaman ini akan auto-refresh saat pembayaran terdeteksi."
                pkg={data.package}
            />
        );
    }

    if (data.status === 'paid') {
        return (
            <StatusCard
                tone="info"
                icon={<Loader2 className="w-12 h-12 text-emerald-400 animate-spin" />}
                title="Pembayaran Berhasil!"
                description="Sedang membuat voucher untuk Anda... (~3 detik)"
                pkg={data.package}
            />
        );
    }

    if (data.status === 'failed') {
        return (
            <StatusCard
                tone="error"
                icon={<AlertCircle className="w-12 h-12 text-red-400" />}
                title="Maaf, Terjadi Kendala"
                description={`Voucher gagal dibuat. Pembayaran Anda akan diproses ulang oleh operator. ${data.errorMessage ? `Detail: ${data.errorMessage}` : ''}`}
                pkg={data.package}
            />
        );
    }

    if (data.status === 'expired') {
        return (
            <StatusCard
                tone="warn"
                icon={<AlertCircle className="w-12 h-12 text-amber-400" />}
                title="Sesi Berakhir"
                description="Pembelian ini sudah kadaluarsa. Silakan beli kembali dari halaman jual."
                pkg={data.package}
            />
        );
    }

    // status === 'fulfilled'
    const voucher = data.voucher;
    return (
        <div className="min-h-screen bg-slate-950 text-slate-100">
            <div className="bg-gradient-to-r from-emerald-600 to-blue-600 px-4 py-8 text-center">
                <CheckCircle2 className="w-16 h-16 mx-auto mb-2" />
                <h1 className="text-2xl font-bold">Voucher Siap Pakai!</h1>
                {data.buyerPhone && (
                    <p className="text-emerald-100 text-sm mt-1">Kode juga sudah dikirim ke {data.buyerPhone}</p>
                )}
            </div>

            <div className="max-w-md mx-auto px-4 py-6 space-y-4">
                {/* Voucher code card */}
                <div className="bg-slate-900 border-2 border-emerald-500/40 rounded-2xl p-6 text-center">
                    <Wifi className="w-8 h-8 text-emerald-400 mx-auto mb-3" />
                    <div className="text-xs uppercase tracking-wider text-slate-400 mb-1">Kode Voucher</div>
                    <div className="text-4xl sm:text-5xl font-mono font-black text-white tracking-wider mb-4 break-all">{voucher.code}</div>

                    <button
                        onClick={() => copy(voucher.code)}
                        className="w-full bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white py-3 rounded-lg font-semibold flex items-center justify-center gap-2 transition-colors"
                    >
                        <Copy className="w-4 h-4" />
                        {copied ? 'Tersalin!' : 'Salin Kode'}
                    </button>
                </div>

                {/* Package info */}
                {data.package && (
                    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                        <div className="text-xs uppercase text-slate-500 mb-1">Paket</div>
                        <div className="text-fg font-semibold">{data.package.name}</div>
                        <div className="flex justify-between mt-1 text-sm text-slate-400">
                            <span>Durasi: {cycleLabel(data.package.cycleType, data.package.cycleValue)}</span>
                            <span>{fmtIDR(data.package.price)}</span>
                        </div>
                    </div>
                )}

                {/* Instruksi */}
                <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                    <h3 className="text-sm uppercase tracking-wider text-slate-400 font-semibold mb-2">Cara Login</h3>
                    <ol className="space-y-2 text-sm text-slate-300">
                        <li className="flex gap-2">
                            <span className="text-blue-400 font-bold">1.</span>
                            <span>Connect ke jaringan WiFi</span>
                        </li>
                        <li className="flex gap-2">
                            <span className="text-blue-400 font-bold">2.</span>
                            <span>Buka browser → akan otomatis ke halaman login (atau ke <span className="font-mono text-blue-400">wifi.id</span>)</span>
                        </li>
                        <li className="flex gap-2">
                            <span className="text-blue-400 font-bold">3.</span>
                            <span>Masukkan kode <span className="font-mono text-emerald-400">{voucher.code}</span> di kolom <strong>username</strong> & <strong>password</strong></span>
                        </li>
                        <li className="flex gap-2">
                            <span className="text-blue-400 font-bold">4.</span>
                            <span>Selamat menikmati internet! 🎉</span>
                        </li>
                    </ol>
                </div>

                <div className="text-center text-xs text-slate-500 pt-2">
                    ⚠️ Simpan kode ini. Halaman ini bisa diakses ulang dengan URL yang sama.
                </div>
            </div>
        </div>
    );
}

function StatusCard({ tone, icon, title, description, pkg }) {
    const toneCls = tone === 'error' ? 'border-red-500/30'
        : tone === 'warn' ? 'border-amber-500/30'
        : 'border-blue-500/30';
    return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
            <div className={`max-w-md w-full bg-slate-900 border ${toneCls} rounded-xl p-6 text-center`}>
                <div className="mb-3 flex justify-center">{icon}</div>
                <h2 className="text-xl font-bold text-white mb-2">{title}</h2>
                <p className="text-slate-400 text-sm mb-4">{description}</p>
                {pkg && (
                    <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-3 text-left text-sm">
                        <div className="text-xs uppercase text-slate-500 mb-0.5">Paket</div>
                        <div className="text-white font-semibold">{pkg.name}</div>
                        <div className="flex justify-between mt-1 text-slate-400">
                            <span>{cycleLabel(pkg.cycleType, pkg.cycleValue)}</span>
                            <span>{fmtIDR(pkg.price)}</span>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
