import React from 'react';
import { Button } from '@/components/ui/Button';
import { X, AlertTriangle, Wifi, WifiOff } from 'lucide-react';
import clsx from 'clsx';

function AnalyticsStatModals({ detailModal, setDetailModal }) {
    if (!detailModal.open) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setDetailModal({ open: false, type: null, title: '', data: null })}>
            <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-lg mx-4 max-h-[80vh] overflow-hidden shadow-2xl" onClick={(e) => e.stopPropagation()}>
                {/* Modal Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
                    <h3 className="text-lg font-semibold text-white">{detailModal.title}</h3>
                    <button
                        onClick={() => setDetailModal({ open: false, type: null, title: '', data: null })}
                        className="text-slate-400 hover:text-white transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Modal Content */}
                <div className="p-5 overflow-y-auto max-h-[60vh]">
                    {detailModal.type === 'alerts' && (
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-slate-800 rounded-lg p-4 text-center">
                                    <p className="text-3xl font-bold text-amber-400">{detailModal.data?.total || 0}</p>
                                    <p className="text-sm text-slate-400 mt-1">Total Alerts</p>
                                </div>
                                <div className="bg-slate-800 rounded-lg p-4 text-center">
                                    <p className="text-3xl font-bold text-red-400">{detailModal.data?.unresolved || 0}</p>
                                    <p className="text-sm text-slate-400 mt-1">Unresolved</p>
                                </div>
                            </div>
                            <p className="text-sm text-slate-500 text-center">Klik "View All History" di panel alerts untuk melihat detail lengkap.</p>
                        </div>
                    )}

                    {detailModal.type === 'uptime' && (
                        <div className="space-y-4">
                            <div className="bg-slate-800 rounded-lg p-6 text-center">
                                <p className="text-5xl font-bold text-emerald-400">{detailModal.data?.uptime || 0}%</p>
                                <p className="text-sm text-slate-400 mt-2">Rata-rata Uptime Jaringan</p>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-4 text-center">
                                    <p className="text-2xl font-bold text-emerald-400">{detailModal.data?.online || 0}</p>
                                    <p className="text-xs text-slate-400 mt-1">Router Online</p>
                                </div>
                                <div className="bg-slate-800 rounded-lg p-4 text-center">
                                    <p className="text-2xl font-bold text-slate-300">{detailModal.data?.total || 0}</p>
                                    <p className="text-xs text-slate-400 mt-1">Total Router</p>
                                </div>
                            </div>
                        </div>
                    )}

                    {detailModal.type === 'routers' && (
                        <div className="space-y-4">
                            <div className="grid grid-cols-3 gap-3">
                                <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 text-center">
                                    <p className="text-2xl font-bold text-blue-400">{detailModal.data?.total || 0}</p>
                                    <p className="text-xs text-slate-400">Total</p>
                                </div>
                                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3 text-center">
                                    <p className="text-2xl font-bold text-emerald-400">{detailModal.data?.online || 0}</p>
                                    <p className="text-xs text-slate-400">Online</p>
                                </div>
                                <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-center">
                                    <p className="text-2xl font-bold text-red-400">{detailModal.data?.offline || 0}</p>
                                    <p className="text-xs text-slate-400">Offline</p>
                                </div>
                            </div>
                            <div className="space-y-2 mt-4">
                                <p className="text-xs text-slate-500 uppercase tracking-wider">Router List</p>
                                {detailModal.data?.routers?.slice(0, 8).map((router) => (
                                    <div key={router.id} className="flex items-center justify-between p-3 bg-slate-800 rounded-lg">
                                        <div className="flex items-center gap-3">
                                            <div className={clsx("w-2 h-2 rounded-full", router.status === 'online' ? 'bg-emerald-500' : 'bg-red-500')} />
                                            <div>
                                                <p className="text-sm font-medium text-white">{router.name}</p>
                                                <p className="text-xs text-slate-500 font-mono">{router.host}</p>
                                            </div>
                                        </div>
                                        <span className={clsx(
                                            "px-2 py-1 rounded text-xs font-medium",
                                            router.status === 'online' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
                                        )}>
                                            {router.status}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {detailModal.type === 'devices' && (
                        <div className="space-y-4">
                            <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-6 text-center">
                                <p className="text-5xl font-bold text-blue-400">{detailModal.data?.total || 0}</p>
                                <p className="text-sm text-slate-400 mt-2">Total Netwatch Devices</p>
                            </div>
                            <p className="text-sm text-slate-500 text-center">Lihat halaman Map untuk detail setiap device.</p>
                        </div>
                    )}

                    {detailModal.type === 'pppoe-connect' && (
                        <div className="space-y-4">
                            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-4 text-center">
                                <p className="text-4xl font-bold text-emerald-400">{detailModal.data?.connects || 0}</p>
                                <p className="text-sm text-slate-400 mt-1">Koneksi PPPoE Baru</p>
                            </div>
                            <div className="space-y-2">
                                <p className="text-xs text-slate-500 uppercase tracking-wider">Status PPPoE Online</p>
                                {detailModal.data?.downStatus?.length === 0 ? (
                                    <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-4 text-center">
                                        <Wifi className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
                                        <p className="text-emerald-400 font-medium">Semua PPPoE Online ✓</p>
                                        <p className="text-xs text-slate-500 mt-1">Tidak ada yang sedang down</p>
                                    </div>
                                ) : (
                                    <p className="text-sm text-slate-400 text-center py-4">
                                        Lihat card "PPPoE Disconnect" untuk melihat yang sedang down
                                    </p>
                                )}
                            </div>
                        </div>
                    )}

                    {detailModal.type === 'pppoe-disconnect' && (
                        <div className="space-y-4">
                            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 text-center">
                                <p className="text-4xl font-bold text-red-400">{detailModal.data?.disconnects || 0}</p>
                                <p className="text-sm text-slate-400 mt-1">PPPoE Terputus</p>
                            </div>
                            {detailModal.data?.disconnectors?.length > 0 && (
                                <div className="space-y-2">
                                    <p className="text-xs text-slate-500 uppercase tracking-wider flex items-center gap-2">
                                        <AlertTriangle className="w-3 h-3" />
                                        Top Disconnectors
                                    </p>
                                    <div className="space-y-2 max-h-40 overflow-y-auto">
                                        {detailModal.data.disconnectors.map((client, i) => (
                                            <div key={i} className="flex items-center justify-between p-3 bg-slate-800 rounded-lg">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-400 text-sm font-bold">
                                                        {i + 1}
                                                    </div>
                                                    <div>
                                                        <p className="text-sm font-medium text-white">{client.name}</p>
                                                        <p className="text-xs text-slate-500">{client.routerName}</p>
                                                    </div>
                                                </div>
                                                <span className="px-2 py-1 rounded bg-amber-500/10 text-amber-400 text-xs font-bold">
                                                    {client.disconnectCount}x
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {detailModal.data?.downStatus?.length > 0 && (
                                <div className="space-y-2">
                                    <p className="text-xs text-slate-500 uppercase tracking-wider flex items-center gap-2">
                                        <WifiOff className="w-3 h-3 text-red-400" />
                                        Sedang Down Sekarang
                                    </p>
                                    <div className="space-y-2 max-h-40 overflow-y-auto">
                                        {detailModal.data.downStatus.map((client, i) => (
                                            <div key={i} className="flex items-center justify-between p-3 bg-red-500/5 border border-red-500/20 rounded-lg">
                                                <div>
                                                    <p className="text-sm font-medium text-white">{client.name}</p>
                                                    <p className="text-xs text-slate-500">{client.routerName} • {client.address || 'No IP'}</p>
                                                </div>
                                                <div className="text-right">
                                                    <span className="text-xs text-red-400 font-medium">Down</span>
                                                    <p className="text-[10px] text-slate-600">
                                                        {client.downSince ? new Date(client.downSince).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '--'}
                                                    </p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {(!detailModal.data?.disconnectors?.length && !detailModal.data?.downStatus?.length) && (
                                <div className="bg-slate-800 rounded-lg p-4 text-center">
                                    <Wifi className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
                                    <p className="text-emerald-400 font-medium">Tidak ada data disconnect</p>
                                    <p className="text-xs text-slate-500 mt-1">Semua PPPoE stabil dalam periode ini</p>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Modal Footer */}
                <div className="px-5 py-4 border-t border-slate-700 flex justify-end">
                    <Button variant="outline" size="sm" onClick={() => setDetailModal({ open: false, type: null, title: '', data: null })}>
                        Tutup
                    </Button>
                </div>
            </div>
        </div>
    );
}

export default AnalyticsStatModals;
