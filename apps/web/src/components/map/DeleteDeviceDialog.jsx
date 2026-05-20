import React from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Trash2, AlertTriangle } from 'lucide-react';

/**
 * Three-mode delete dialog for map markers. Operators told us the previous
 * single-action trash (archive ONU) was ambiguous — for paired ODP/ONU
 * entities the marker would refuse to disappear because the netwatch row
 * was untouched. This dialog forces an explicit choice.
 *
 * Modes:
 *   'onu'        — soft-archive the linked ONU row
 *   'netwatch'   — hard-delete the netwatch row (and remove from MikroTik)
 *   'both'       — do both in sequence
 *
 * Each option is only enabled when the underlying entity actually exists
 * on this node. ODP shows only 'netwatch' since it has no ONU linkage of
 * its own.
 */
export default function DeleteDeviceDialog({ isOpen, node, onClose, onConfirm }) {
    if (!node) return null;

    const hasOnu = !!(node.linkedOnuId || node.deviceType === 'onu');
    const hasNetwatch = node.deviceType !== 'onu' && !!node.id && !!node.routerId;
    const bothAvailable = hasOnu && hasNetwatch;
    const displayName = node.name || node.host || 'perangkat ini';

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Hapus "${displayName}" dari aplikasi`} maxWidth="max-w-md">
            <div className="space-y-3">
                <p className="text-sm text-slate-300">
                    Pilih apa yang ingin dihapus. Aksi bisa diulang/balik kalau salah pilih.
                </p>

                <button
                    type="button"
                    onClick={() => onConfirm({ mode: 'onu', node })}
                    disabled={!hasOnu}
                    className="w-full text-left p-3 rounded-lg border border-slate-700 bg-slate-800/50 hover:bg-slate-700/60 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                    <div className="flex items-start gap-2">
                        <Trash2 className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                        <div>
                            <div className="text-sm font-semibold text-white">Hapus ONU saja</div>
                            <div className="text-[11px] text-slate-400 mt-0.5">
                                Archive entry di tabel ONU. Akan muncul lagi otomatis kalau OLT
                                polling menemukan SN ini. Cocok kalau ONU dilepas sementara.
                            </div>
                        </div>
                    </div>
                </button>

                <button
                    type="button"
                    onClick={() => onConfirm({ mode: 'netwatch', node })}
                    disabled={!hasNetwatch}
                    className="w-full text-left p-3 rounded-lg border border-slate-700 bg-slate-800/50 hover:bg-slate-700/60 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                    <div className="flex items-start gap-2">
                        <Trash2 className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                        <div>
                            <div className="text-sm font-semibold text-white">Hapus Netwatch saja</div>
                            <div className="text-[11px] text-slate-400 mt-0.5">
                                Hapus row netwatch dari aplikasi <em>dan</em> dari
                                <code className="mx-1 px-1 bg-slate-900/80 rounded">/tool netwatch</code>
                                MikroTik. Cocok untuk ODP / host yang tidak perlu di-monitor lagi.
                            </div>
                        </div>
                    </div>
                </button>

                <button
                    type="button"
                    onClick={() => onConfirm({ mode: 'both', node })}
                    disabled={!bothAvailable}
                    className="w-full text-left p-3 rounded-lg border border-red-500/40 bg-red-500/10 hover:bg-red-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                    <div className="flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
                        <div>
                            <div className="text-sm font-semibold text-red-300">Hapus Semua</div>
                            <div className="text-[11px] text-red-300/70 mt-0.5">
                                Archive ONU + delete netwatch. Marker hilang total dari map
                                sampai polling OLT/netwatch berikutnya membawa data baru.
                            </div>
                        </div>
                    </div>
                </button>

                <div className="pt-2 flex justify-end">
                    <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
                </div>
            </div>
        </Modal>
    );
}
