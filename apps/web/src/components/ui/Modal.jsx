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
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-300"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            onClick={(e) => {
                if (e.target === e.currentTarget) onClose();
            }}
        >
            <div
                className={clsx(
                    "relative w-full glass-premium border border-white/10 rounded-2xl shadow-[0_32px_64px_-12px_rgba(0,0,0,0.6)] animate-in zoom-in-95 slide-in-from-bottom-4 duration-500 cubic-bezier(0.175, 0.885, 0.32, 1.275) flex flex-col max-h-[90dvh] overflow-hidden",
                    maxWidth
                )}
            >
                <div className="flex items-start sm:items-center justify-between gap-3 p-4 sm:p-5 border-b border-white/5 shrink-0 bg-white/5">
                    <h2 id={titleId} className="text-base sm:text-lg md:text-xl font-bold text-white tracking-tight break-all leading-tight min-w-0">{title}</h2>
                    <button
                        onClick={onClose}
                        aria-label="Close modal"
                        className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-all duration-300 shrink-0"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>
                <div className="p-6 overflow-y-auto custom-scrollbar">
                    {children}
                </div>
            </div>
        </div>
    );
};
