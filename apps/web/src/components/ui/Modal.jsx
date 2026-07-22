import React, { useEffect, useId, useRef } from 'react';
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
 *   - Optional footer slot (sticky bottom dengan border-top)
 *   - Size variants (sm/md/lg/xl/fullscreen) atau custom maxWidth
 *
 * A11y note: focus trap TIDAK di-implement (browser default tab cycle bisa
 * keluar dari modal). Untuk modal kritis dengan banyak focusable element,
 * pertimbangkan tambah focus-trap-react atau focus management manual.
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
 *   zIndexClass?: string — Tailwind z-index override (default 'z-[1200]').
 *                          Naikkan HANYA saat modal dibuka DARI ATAS overlay
 *                          lain yang lebih tinggi dari 1200 (mis. konfirmasi
 *                          hapus di dalam Edit Device yang overlay-nya z-2000),
 *                          kalau tidak modal tenggelam di belakang.
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
    zIndexClass = 'z-[1200]',
}) => {
    const titleId = useId();
    const visible = isOpen ?? open ?? false;

    // Stale closure fix (per code-review HIGH): wrap onClose di ref supaya
    // tidak masuk effect deps. Sebelumnya `[visible, dismissible, onClose]`
    // → setiap parent re-render (umumnya inline arrow), effect tear down
    // + re-attach + prevOverflow re-capture jadi 'hidden' alih-alih nilai
    // asli → body scroll terkunci permanen setelah modal close.
    const onCloseRef = useRef(onClose);
    useEffect(() => {
        onCloseRef.current = onClose;
    });

    useEffect(() => {
        if (!visible) return;

        const handleEscape = (e) => {
            if (e.key === 'Escape' && dismissible) onCloseRef.current();
        };
        document.addEventListener('keydown', handleEscape);
        // Lock body scroll
        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';

        return () => {
            document.removeEventListener('keydown', handleEscape);
            document.body.style.overflow = prevOverflow;
        };
    }, [visible, dismissible]);

    if (!visible) return null;

    const widthClass = maxWidth || SIZE_CLASSES[size] || SIZE_CLASSES.md;

    return createPortal(
        // Default z-[1200] supaya di ATAS SidePanel (z-1110) + AlertPanel.
        // Di BAWAH Sidebar mobile drawer (z-2001) + SettingsFlyout (z-2060)
        // — kalau Sidebar drawer terbuka, user harus close itu dulu untuk
        // buka Modal. Hindari deadlock visual. Bisa dinaikkan via zIndexClass
        // saat dibuka dari overlay yang lebih tinggi (lihat JSDoc).
        <div
            className={clsx(
                'fixed inset-0 flex items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-sm dl-backdrop-in',
                zIndexClass,
            )}
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
