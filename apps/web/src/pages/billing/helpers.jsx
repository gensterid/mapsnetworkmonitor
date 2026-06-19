import React from 'react';

/**
 * Shared helpers untuk Billing tabs.
 *
 * Sebelumnya inline di Billing.jsx (1694 baris monolith). Setelah Step
 * Refactor Billing, semua tab di-extract ke file masing-masing dan
 * shared helpers di-centralize di sini.
 */

// Modal: re-export dari single source di components/ui/Modal.jsx (Modal
// pattern consolidation). Billing tabs sebelumnya pakai custom Modal di
// helpers ini — sekarang centralized. Prop `open` backward compat
// di-handle di base Modal (alias ke isOpen).
export { Modal } from '@/components/ui/Modal';

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

export function Field({ label, children }) {
    return (
        <label className="block mb-3">
            <span className="block text-xs font-semibold text-fg-muted uppercase tracking-wide mb-1">{label}</span>
            {children}
        </label>
    );
}
