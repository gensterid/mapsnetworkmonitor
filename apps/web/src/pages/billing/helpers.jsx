import React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

/**
 * Shared helpers untuk Billing tabs.
 *
 * Sebelumnya inline di Billing.jsx (1694 baris monolith). Setelah Step
 * Refactor Billing, semua tab di-extract ke file masing-masing dan
 * shared helpers di-centralize di sini.
 */

export const fmtIDR = (v) =>
    new Intl.NumberFormat('id-ID', {
        style: 'currency',
        currency: 'IDR',
        minimumFractionDigits: 0,
    }).format(Number(v) || 0);

export const fmtDate = (d) =>
    d
        ? new Date(d).toLocaleDateString('id-ID', {
              day: '2-digit',
              month: 'short',
              year: 'numeric',
          })
        : '—';

export const fmtDateTime = (d) =>
    d
        ? new Date(d).toLocaleString('id-ID', {
              dateStyle: 'short',
              timeStyle: 'short',
          })
        : '—';

export const inputCls =
    'w-full bg-slate-surface border border-slate-border rounded px-3 py-2 text-fg text-sm focus:ring-1 focus:ring-primary';

/**
 * Modal pakai createPortal supaya escape ancestor transform/overflow/
 * containing-block yang otherwise pin `position: fixed` ke scrolled
 * content area instead of viewport.
 */
export function Modal({ open, onClose, title, children, footer, maxWidth = 'max-w-lg' }) {
    if (!open) return null;
    return createPortal(
        <div className="fixed inset-0 z-[1000] bg-black/60 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4">
            <div
                className={`w-full ${maxWidth} bg-surface-dark border border-slate-border rounded-xl shadow-2xl flex flex-col max-h-[90vh]`}
            >
                <div className="flex items-center justify-between border-b border-slate-border px-4 sm:px-5 py-3 shrink-0">
                    <h3 className="font-semibold text-fg text-sm sm:text-base">{title}</h3>
                    <button
                        onClick={onClose}
                        aria-label="Close"
                        className="text-fg-muted hover:text-fg min-h-10 min-w-10 flex items-center justify-center -mr-2"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>
                <div className="p-4 sm:p-5 overflow-y-auto overscroll-contain flex-1 min-h-0">{children}</div>
                {footer && (
                    <div className="border-t border-slate-border px-4 sm:px-5 py-3 flex flex-wrap justify-end gap-2 shrink-0">
                        {footer}
                    </div>
                )}
            </div>
        </div>,
        document.body,
    );
}

export function Field({ label, children }) {
    return (
        <label className="block mb-3">
            <span className="block text-xs font-semibold text-fg-muted uppercase tracking-wide mb-1">{label}</span>
            {children}
        </label>
    );
}
