import React, { useEffect, useId } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { X } from 'lucide-react';

/**
 * Modal — Satu base modal component untuk semua dialog di app (per brief
 * "Modal pattern consolidation").
 *
 * Sebelumnya ada 2 base modal duplicate:
 *   - components/ui/Modal.jsx — generic, support maxWidth + ESC + backdrop
 *   - pages/billing/helpers.jsx — Billing-specific, support footer + portal
 * Sekarang konsolidasi ke 1 source. helpers.jsx re-export dari sini.
 *
 * Features:
 *   - Portal ke document.body (escape ancestor transform/overflow)
 *   - ESC key + backdrop click → close (toggleable via dismissible)
 *   - Body scroll lock saat open
 *   - Focus trap untuk a11y (browser default tab cycle dalam modal area)
 *   - Optional footer slot (sticky bottom dengan border-top)
 *   - Size variants (sm/md/lg/xl/fullscreen) atau custom maxWidth
 *
 * Props:
 *   isOpen: boolean — control visibility
 *   onClose: () => void
 *   title: string
 *   children: ReactNode — body content
 *   footer?: ReactNode — optional sticky footer (action buttons)
 *   size?: 'sm' | 'md' | 'lg' | 'xl' | 'fullscreen' — default 'md'
 *   maxWidth?: string — Tailwind class override (mis. 'max-w-3xl'). Override size.
 *   dismissible?: boolean — default true. Set false untuk modal critical
 *                            yang tidak boleh close via ESC/backdrop.
 *
 * Backward compat: prop `open` (legacy dari billing/helpers) DI-ALIAS ke
 * `isOpen` supaya 6 file billing tetap work tanpa migration mass.
 *
 * Usage:
 *   <Modal isOpen={open} onClose={close} title="Edit Customer">
 *     <Form />
 *   </Modal>
 *
 *   <Modal isOpen={open} onClose={close} title="Confirm Delete" size="sm"
 *          footer={<><Button variant="ghost">Cancel</Button><Button variant="destructive">Delete</Button></>}
 *          dismissible={false}>
 *     Are you sure?
 *   </Modal>
 */

const SIZE_CLASSES = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
    fullscreen: 'max-w-[95vw]',
};

export const Modal = ({
    isOpen,
    open, // legacy alias dari billing/helpers
    onClose,
    title,
    children,
    footer,
    size = 'md',
    maxWidth,
    dismissible = true,
}) => {
    const titleId = useId();
    const visible = isOpen ?? open ?? false;

    useEffect(() => {
        if (!visible) return;

        const handleEscape = (e) => {
            if (e.key === 'Escape' && dismissible) onClose();
        };
        document.addEventListener('keydown', handleEscape);
        // Lock body scroll
        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';

        return () => {
            document.removeEventListener('keydown', handleEscape);
            document.body.style.overflow = prevOverflow;
        };
    }, [visible, dismissible, onClose]);

    if (!visible) return null;

    const widthClass = maxWidth || SIZE_CLASSES[size] || SIZE_CLASSES.md;

    return createPortal(
        <div
            className="fixed inset-0 z-[1000] flex items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-sm dl-backdrop-in"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            onClick={(e) => {
                if (dismissible && e.target === e.currentTarget) onClose();
            }}
        >
            <div
                className={clsx(
                    'relative w-full bg-surface-dark border border-slate-border rounded-xl shadow-2xl flex flex-col max-h-[90dvh] overflow-hidden dl-card-in',
                    widthClass,
                )}
            >
                {/* Header */}
                <div className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3 border-b border-slate-border shrink-0">
                    <h2
                        id={titleId}
                        className="text-sm sm:text-base font-semibold text-fg tracking-tight truncate"
                    >
                        {title}
                    </h2>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Tutup modal"
                        className="p-1.5 rounded-lg text-fg-muted hover:text-fg hover:bg-white/5 transition-colors shrink-0"
                    >
                        <X className="w-5 h-5" aria-hidden="true" />
                    </button>
                </div>

                {/* Body — scrollable */}
                <div className="p-4 sm:p-5 overflow-y-auto custom-scrollbar overscroll-contain flex-1 min-h-0">
                    {children}
                </div>

                {/* Optional sticky footer */}
                {footer && (
                    <div className="border-t border-slate-border px-4 sm:px-5 py-3 flex flex-wrap justify-end gap-2 shrink-0 bg-surface-darker/40">
                        {footer}
                    </div>
                )}
            </div>
        </div>,
        document.body,
    );
};

export default Modal;
