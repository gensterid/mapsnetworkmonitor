import React, { useState } from 'react';
import { Modal } from './Modal';
import { Button } from './Button';
import { Trash2, AlertTriangle } from 'lucide-react';

export const DeleteConfirmationModal = ({
    isOpen,
    onClose,
    onConfirm,
    title = "Confirm Delete",
    message = "Are you sure you want to delete this item? This action cannot be undone.",
    itemName = "",
    showMikrotikOption = false,
    confirmText = "Delete",
    isDeleting = false
}) => {
    const [deleteFromMikrotik, setDeleteFromMikrotik] = useState(true);

    const handleConfirm = () => {
        onConfirm(deleteFromMikrotik);
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={title}>
            <div className="space-y-4">
                <div className="flex items-start gap-4 p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
                    <div className="p-2 bg-red-500/20 rounded-lg shrink-0">
                        <AlertTriangle className="w-5 h-5 text-red-500" />
                    </div>
                    <div>
                        <p className="text-sm text-slate-300 leading-relaxed font-medium">
                            {message}
                        </p>
                        {itemName && (
                            <p className="text-sm font-bold text-white mt-1.5 font-mono bg-slate-800/50 px-2 py-1 rounded inline-block">
                                {itemName}
                            </p>
                        )}
                    </div>
                </div>

                {showMikrotikOption && (
                    <div className="p-4 bg-slate-800/30 border border-slate-700/50 rounded-xl space-y-3">
                        <label className="flex items-center gap-3 cursor-pointer group">
                            <div className="relative flex items-center">
                                <input
                                    type="checkbox"
                                    checked={deleteFromMikrotik}
                                    onChange={(e) => setDeleteFromMikrotik(e.target.checked)}
                                    className="peer appearance-none w-5 h-5 rounded-md border border-slate-600 bg-slate-900 checked:bg-primary checked:border-primary transition-all cursor-pointer hover:border-slate-500"
                                />
                                <svg className="absolute w-3.5 h-3.5 text-white left-0.5 top-0.5 pointer-events-none opacity-0 peer-checked:opacity-100 transition-opacity" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="20 6 9 17 4 12"></polyline>
                                </svg>
                            </div>
                            <div className="flex flex-col">
                                <span className="text-sm font-semibold text-slate-200 group-hover:text-white transition-colors">
                                    Delete from MikroTik router
                                </span>
                                <span className="text-[11px] text-slate-500 leading-tight mt-0.5">
                                    Uncheck to keep the entry in the router while removing it from database.
                                </span>
                            </div>
                        </label>
                    </div>
                )}

                <div className="flex justify-end gap-3 pt-2">
                    <Button variant="ghost" onClick={onClose} disabled={isDeleting} className="px-5">
                        Cancel
                    </Button>
                    <Button
                        variant="destructive"
                        onClick={handleConfirm}
                        loading={isDeleting}
                        className="px-6 min-w-[120px]"
                    >
                        <Trash2 className="w-4 h-4 mr-2" />
                        {confirmText}
                    </Button>
                </div>
            </div>
        </Modal>
    );
};
