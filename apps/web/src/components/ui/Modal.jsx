import React from 'react';
import clsx from 'clsx';
import { X } from 'lucide-react';

export const Modal = ({ isOpen, onClose, title, children, maxWidth = 'max-w-md' }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div
                className={clsx(
                    "relative w-full bg-slate-900 border border-slate-700 rounded-xl shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col max-h-[90dvh]", // Added flex-col and max-h
                    maxWidth
                )}
            >
                <div className="flex items-center justify-between p-4 border-b border-slate-700/50 shrink-0">
                    <h2 className="text-lg font-semibold text-white">{title}</h2>
                    <button
                        onClick={onClose}
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
