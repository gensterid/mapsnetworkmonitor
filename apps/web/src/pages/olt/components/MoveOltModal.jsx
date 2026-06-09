import React, { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { ArrowRight, AlertTriangle } from 'lucide-react';
import { useOlts, useReassignOnu } from '@/hooks';

/**
 * Manual reassign of an ONU from its current OLT to a different OLT.
 * Used when a customer's PON port physically moved between OLTs and
 * the operator wants to keep the same DB record (preserving map
 * coordinates, name, and audit history).
 *
 * Operator must:
 *  1. Pick target OLT (excludes current OLT from dropdown)
 *  2. Type the new PON port string as it appears on the target OLT
 *
 * After save, run "Refresh Drive" on target OLT to confirm the ONU
 * now reports under the new linkage.
 */
export default function MoveOltModal({ isOpen, onClose, onu, currentOltId }) {
    const { data: olts = [] } = useOlts();
    const reassign = useReassignOnu();
    const [targetOltId, setTargetOltId] = useState('');
    const [targetPonPort, setTargetPonPort] = useState(onu?.ponPort || '');

    const availableOlts = olts.filter((o) => o.id !== currentOltId);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!targetOltId) return;
        await reassign.mutateAsync({
            onuId: onu.id,
            targetOltId,
            targetPonPort: targetPonPort || null,
        });
        onClose();
    };

    React.useEffect(() => {
        if (isOpen) {
            setTargetOltId('');
            setTargetPonPort(onu?.ponPort || '');
        }
    }, [isOpen, onu]);

    if (!onu) return null;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Pindah OLT — ${onu.name || onu.sn}`}>
            <form onSubmit={handleSubmit} className="space-y-5 py-2">
                <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 flex gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                    <div className="text-xs text-amber-200/90 leading-relaxed">
                        Gunakan saat customer secara fisik pindah PON ke OLT lain. Record ONU (SN, koordinat map, nama, deskripsi) tetap dipertahankan. <strong>Pastikan registrasi lama di OLT asal sudah dihapus</strong> untuk menghindari dual-listing.
                    </div>
                </div>

                <div className="space-y-2">
                    <label className="text-[10px] font-bold text-fg-muted uppercase tracking-widest">SN / Identitas ONU</label>
                    <input value={onu.sn || '—'} disabled className="w-full px-4 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-sm text-fg-muted font-mono opacity-60" />
                </div>

                <div className="grid grid-cols-[1fr_auto_1fr] gap-3 items-end">
                    <div className="space-y-2">
                        <label className="text-[10px] font-bold text-fg-muted uppercase tracking-widest">PON Port Saat Ini</label>
                        <input value={onu.ponPort || '—'} disabled className="w-full px-4 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-sm text-fg-muted font-mono opacity-60" />
                    </div>
                    <ArrowRight className="w-4 h-4 text-fg-muted mb-3" />
                    <div className="space-y-2">
                        <label className="text-[10px] font-bold text-fg-muted uppercase tracking-widest">PON Port Baru</label>
                        <input
                            value={targetPonPort}
                            onChange={(e) => setTargetPonPort(e.target.value)}
                            className="w-full px-4 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-sm text-fg font-mono focus:ring-1 focus:ring-primary outline-none"
                            placeholder="0/1/3"
                        />
                    </div>
                </div>

                <div className="space-y-2">
                    <label className="text-[10px] font-bold text-fg-muted uppercase tracking-widest">OLT Tujuan</label>
                    <select
                        value={targetOltId}
                        onChange={(e) => setTargetOltId(e.target.value)}
                        required
                        className="w-full px-4 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-sm text-fg focus:ring-1 focus:ring-primary outline-none"
                    >
                        <option value="">Pilih OLT…</option>
                        {availableOlts.map((o) => (
                            <option key={o.id} value={o.id}>
                                {o.name} {o.type ? `(${o.type})` : ''} — {o.host}
                            </option>
                        ))}
                    </select>
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-slate-800/50">
                    <Button type="button" variant="ghost" onClick={onClose} disabled={reassign.isPending}>
                        Batal
                    </Button>
                    <Button type="submit" variant="primary" loading={reassign.isPending} disabled={!targetOltId}>
                        Pindah Sekarang
                    </Button>
                </div>
            </form>
        </Modal>
    );
}
