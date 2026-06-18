import React, { useEffect, useRef } from 'react';
import clsx from 'clsx';
import { X } from 'lucide-react';

/**
 * SidePanel — Generic wrapper untuk panel slide-in dari kanan.
 *
 * Brief user:
 *   - Setiap panel punya tombol tutup (X) yang jelas
 *   - Panel tidak menumpuk — parent yang manage state, kalau buka panel
 *     baru, panel lama otomatis tutup (single panel state di NetworkMap)
 *
 * Pakai untuk: AlertPanel, RouterDetailPanel, NetwatchDetailPanel.
 *
 * Behavior:
 *   - Slide-in dari kanan saat isOpen=true
 *   - Backdrop click → onClose
 *   - ESC key → onClose
 *   - Focus trap di first focusable saat open
 *   - Mobile: full width. Desktop: 384px (w-96).
 *
 * Z-index:
 *   - Backdrop: 1100 (di atas map overlays z-1000, di bawah modal z-2000)
 *   - Panel: 1110
 *   Lebih rendah dari Sidebar mobile drawer (z-2001) — DEFAULT panel
 *   dibuka dari context map, tidak konflik dengan nav drawer.
 *
 * Props:
 *   isOpen: boolean
 *   onClose: () => void
 *   title: string  — header text
 *   icon: ReactNode — header icon (Lucide component)
 *   subtitle?: string — small text below title
 *   accent?: 'online' | 'offline' | 'issue' | 'unknown' | 'primary'
 *     — accent strip warna di kiri header (visual cue status)
 *   children: ReactNode — body content
 *   footer?: ReactNode — optional sticky footer (action buttons)
 */

const ACCENT_BAR = {
    online: 'bg-status-online',
    offline: 'bg-status-offline',
    issue: 'bg-status-issue',
    unknown: 'bg-status-unknown',
    primary: 'bg-primary',
};

export function SidePanel({
    isOpen,
    onClose,
    title,
    icon: Icon,
    subtitle,
    accent = 'primary',
    children,
    footer,
}) {
    const panelRef = useRef(null);

    useEffect(() => {
        if (!isOpen) return;

        const onKey = (e) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', onKey);

        // Focus panel container untuk a11y (screen reader announcement)
        panelRef.current?.focus();

        return () => document.removeEventListener('keydown', onKey);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    return (
        <>
            {/* Backdrop — semi-transparent, blur. Klik untuk close. */}
            <div
                className="fixed inset-0 z-[1100] bg-black/40 backdrop-blur-sm dl-backdrop-in"
                onClick={onClose}
                aria-hidden="true"
            />

            <aside
                ref={panelRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="side-panel-title"
                tabIndex={-1}
                className={clsx(
                    'fixed top-0 right-0 bottom-0 z-[1110] flex flex-col bg-surface-dark border-l border-slate-border shadow-2xl outline-none',
                    'w-full sm:w-96',
                    'dl-slide-in-right',
                )}
            >
                {/* Header */}
                <div className="relative flex items-start gap-3 px-5 py-4 border-b border-slate-border bg-surface-darker/60">
                    {/* Accent bar di kiri */}
                    <div
                        className={clsx('absolute left-0 top-0 bottom-0 w-1', ACCENT_BAR[accent] || ACCENT_BAR.primary)}
                        aria-hidden="true"
                    />

                    {Icon && (
                        <div
                            className={clsx(
                                'w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0',
                                accent === 'online' && 'bg-status-online/15 text-status-online',
                                accent === 'offline' && 'bg-status-offline/15 text-status-offline',
                                accent === 'issue' && 'bg-status-issue/15 text-status-issue',
                                accent === 'unknown' && 'bg-status-unknown/15 text-status-unknown',
                                accent === 'primary' && 'bg-primary/15 text-primary',
                            )}
                        >
                            <Icon className="w-5 h-5" aria-hidden="true" />
                        </div>
                    )}

                    <div className="flex-1 min-w-0">
                        <h2
                            id="side-panel-title"
                            className="text-base font-bold text-fg truncate"
                        >
                            {title}
                        </h2>
                        {subtitle && (
                            <p className="text-xs text-fg-muted truncate mt-0.5">{subtitle}</p>
                        )}
                    </div>

                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Tutup panel"
                        title="Tutup (ESC)"
                        className="flex-shrink-0 p-1.5 rounded-lg text-fg-muted hover:text-fg hover:bg-white/5 transition-colors"
                    >
                        <X className="w-5 h-5" aria-hidden="true" />
                    </button>
                </div>

                {/* Body — scrollable */}
                <div className="flex-1 overflow-y-auto custom-scrollbar">{children}</div>

                {/* Optional sticky footer */}
                {footer && (
                    <div className="px-5 py-3 border-t border-slate-border bg-surface-darker/60">
                        {footer}
                    </div>
                )}
            </aside>
        </>
    );
}

export default SidePanel;
