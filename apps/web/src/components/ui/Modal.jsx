import React, { useEffect, useId } from 'react';
import clsx from 'clsx';
import { X } from 'lucide-react';

export const Modal = ({ isOpen, onClose, title, children, maxWidth = 'max-w-md' }) => {
    const titleId = useId();

    useEffect(() => {
        const handleEscape = (e) => {
            if (e.key === 'Escape') onClose();
        };

        if (isOpen) {
            document.addEventListener('keydown', handleEscape);
            // Lock body scroll when modal is open
            document.body.style.overflow = 'hidden';
        }

        return () => {
            document.removeEventListener('keydown', handleEscape);
            document.body.style.overflow = 'unset';
        };
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
        >
            <div
                className={clsx(
                    "relative w-full bg-slate-900 border border-slate-700 rounded-xl shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col max-h-[90dvh]",
                    maxWidth
                )}
            >
                <div className="flex items-center justify-between p-4 border-b border-slate-700/50 shrink-0">
                    <h2 id={titleId} className="text-lg font-semibold text-white">{title}</h2>
                    <button
                        onClick={onClose}
                        aria-label="Close modal"
                        className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>
                <div className="p-4 overflow-y-auto">
                    {children}
                </div>
            </div>
        </div>
    );
};
