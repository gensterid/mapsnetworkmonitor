import React from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Trash2, AlertTriangle, Server, Database } from 'lucide-react';

/**
 * Delete dialog branches by device type:
 *
 *   ONU device (linked to OLT inventory): three modes —
 *     'onu'         — soft-archive the linked ONU row
 *     'netwatch'    — hard-delete netwatch row (app + MikroTik)
 *     'both'        — do both in sequence
 *
 *   Netwatch-only device (Wi-Fi client, 5G modem, IP cam, etc.) — three modes:
 *     'app_only'      — delete app row only, MikroTik keeps monitoring
 *                       (next sync re-creates row → effectively a 'reset')
 *     'mikrotik_only' — stop monitor at MikroTik, app row stays (is_app_only=true)
 *                       so marker remains with last-known status
 *     'both'          — delete from both sides (full removal)
 *
 * Naming mirrors the operator's mental model so the choice is unambiguous.
 */
export default function DeleteDeviceDialog({ isOpen, node, onClose, onConfirm }) {
    if (!node) return null;

    const hasOnu = !!(node.linkedOnuId || node.deviceType === 'onu');
    const hasNetwatchSide = node.deviceType !== 'onu' && !!node.id && !!node.routerId;
    const displayName = node.name || node.host || 'perangkat ini';

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Hapus "${displayName}" dari aplikasi`} maxWidth="max-w-md">
            <div className="space-y-3 p-4">
                <p className="text-sm text-slate-300">
                    Pilih apa yang ingin dihapus. Aksi bisa diulang/balik kalau salah pilih.
                </p>

                {hasOnu ? (
                    <>
                        {/* ONU device path: archive ONU / netwatch / both */}
                        <ChoiceButton
                            onClick={() => onConfirm({ mode: 'onu', node })}
                            disabled={!hasOnu}
                            icon={<Trash2 className="w-4 h-4 text-amber-400" />}
                            title="Hapus ONU saja"
                            description="Archive entry di tabel ONU. Akan muncul lagi otomatis kalau OLT polling menemukan SN ini. Cocok kalau ONU dilepas sementara."
                        />
                        <ChoiceButton
                            onClick={() => onConfirm({ mode: 'netwatch', node })}
                            disabled={!hasNetwatchSide}
                            icon={<Trash2 className="w-4 h-4 text-amber-400" />}
                            title="Hapus Netwatch saja"
                            description={
                                <>
                                    Hapus row netwatch dari aplikasi <em>dan</em> dari
                                    <code className="mx-1 px-1 bg-slate-900/80 rounded">/tool netwatch</code>
                                    MikroTik. Monitoring berhenti tapi inventory ONU tetap.
                                </>
                            }
                        />
                        <ChoiceButton
                            onClick={() => onConfirm({ mode: 'both', node })}
                            disabled={!(hasOnu && hasNetwatchSide)}
                            danger
                            icon={<AlertTriangle className="w-4 h-4 text-red-400" />}
                            title="Hapus Semua"
                            description="Archive ONU + delete netwatch. Marker hilang total sampai polling OLT/netwatch berikutnya membawa data baru."
                        />
                    </>
                ) : (
                    <>
                        {/* Non-ONU netwatch path: app_only / mikrotik_only / both */}
                        <ChoiceButton
                            onClick={() => onConfirm({ mode: 'app_only', node })}
                            disabled={!hasNetwatchSide}
                            icon={<Database className="w-4 h-4 text-blue-400" />}
                            title="Hapus dari Aplikasi saja"
                            description="Hapus row di DB aplikasi. MikroTik tetap monitor. Sync berikutnya akan re-discover host dengan data fresh — berguna untuk reset koordinat / nama yang salah."
                        />
                        <ChoiceButton
                            onClick={() => onConfirm({ mode: 'mikrotik_only', node })}
                            disabled={!hasNetwatchSide}
                            icon={<Server className="w-4 h-4 text-amber-400" />}
                            title="Hapus dari MikroTik saja"
                            description={
                                <>
                                    Stop monitor di
                                    <code className="mx-1 px-1 bg-slate-900/80 rounded">/tool netwatch</code>
                                    MikroTik. Marker di map tetap (last-known status) dan ditandai{' '}
                                    <em>App-Only</em>. Cocok kalau monitoring tidak perlu tapi placement/koordinat tetap relevan.
                                </>
                            }
                        />
                        <ChoiceButton
                            onClick={() => onConfirm({ mode: 'both', node })}
                            disabled={!hasNetwatchSide}
                            danger
                            icon={<AlertTriangle className="w-4 h-4 text-red-400" />}
                            title="Hapus Semua"
                            description="Hapus dari aplikasi DAN dari MikroTik. Marker hilang total. Cocok kalau host benar-benar tidak terpakai lagi."
                        />
                    </>
                )}

                <div className="pt-2 flex justify-end">
                    <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
                </div>
            </div>
        </Modal>
    );
}

function ChoiceButton({ onClick, disabled, icon, title, description, danger }) {
    const base = danger
        ? 'border-red-500/40 bg-red-500/10 hover:bg-red-500/20'
        : 'border-slate-700 bg-slate-800/50 hover:bg-slate-700/60';
    const titleColor = danger ? 'text-red-300' : 'text-white';
    const descColor = danger ? 'text-red-300/70' : 'text-slate-400';
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            className={`w-full text-left p-3 rounded-lg border ${base} disabled:opacity-40 disabled:cursor-not-allowed transition-colors`}
        >
            <div className="flex items-start gap-2">
                <div className="mt-0.5 shrink-0">{icon}</div>
                <div>
                    <div className={`text-sm font-semibold ${titleColor}`}>{title}</div>
                    <div className={`text-[11px] mt-0.5 ${descColor}`}>{description}</div>
                </div>
            </div>
        </button>
    );
}
