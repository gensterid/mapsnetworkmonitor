import React from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { AlertCircle, RefreshCw } from 'lucide-react';

export default function RebootOnuModal({ 
    isOpen, 
    onClose, 
    onu, 
    onConfirm, 
    isSubmitting 
}) {
    if (!onu) return null;

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Reboot Confirmation"
        >
            <div className="space-y-6 py-2">
                <div className="flex items-start gap-4 p-4 bg-red-500/5 border border-red-500/10 rounded-xl">
                    <div className="p-2 bg-red-500/10 rounded-lg">
                        <AlertCircle className="w-5 h-5 text-red-500" />
                    </div>
                    <div className="flex-1">
                        <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-1">Confirm Reboot</h3>
                        <p className="text-xs text-slate-400 leading-relaxed">
                            You are about to restart the ONU with SN <span className="text-red-400 font-mono font-bold">{onu.sn}</span>. 
                            This will temporarily disconnect all services for this client.
                        </p>
                    </div>
                </div>

                <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-800 space-y-3">
                    <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-500 font-bold uppercase tracking-widest">ONU ID</span>
                        <span className="text-white font-mono">{onu.ponId}-{onu.onuId}</span>
                    </div>
                    {onu.name && (
                        <div className="flex justify-between items-center text-xs">
                            <span className="text-slate-500 font-bold uppercase tracking-widest">Alias</span>
                            <span className="text-emerald-400 font-bold">{onu.name}</span>
                        </div>
                    )}
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-slate-800/50">
                    <Button type="button" variant="ghost" onClick={onClose} disabled={isSubmitting}>
                        Cancel
                    </Button>
                    <Button 
                        type="button" 
                        variant="destructive" 
                        onClick={onConfirm} 
                        loading={isSubmitting}
                        className="bg-red-600 hover:bg-red-700 shadow-lg shadow-red-900/20"
                    >
                        <RefreshCw className="w-4 h-4 mr-2" />
                        Execute Reboot
                    </Button>
                </div>
            </div>
        </Modal>
    );
}
