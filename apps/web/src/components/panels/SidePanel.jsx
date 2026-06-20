import React, { useEffect, useRef, useState, useCallback } from 'react';
import clsx from 'clsx';
import { X } from 'lucide-react';
import { useIsMobile } from '@/hooks';

/**
 * SidePanel — Responsive panel wrapper.
 *
 * Desktop (>= 768px): slide-in dari kanan, width 384px (md:w-96).
 * Mobile  (< 768px):  bottom-sheet \xe2\x80\x94 slide dari bawah, drag-snap
 *                     40vh (collapsed) atau 85vh (expanded).
 *
 * Per spec mobile: "Saat marker di-tap di mobile, panel detail muncul
 * sebagai BOTTOM SHEET (slide dari bawah), bukan sidebar".
 *
 * Pakai untuk: AlertPanel, RouterDetailPanel, NetwatchDetailPanel.
 *
 * Behavior:
 *   - Slide-in dari kanan (desktop) / atas (mobile, snap collapse 40vh)
 *   - Backdrop click \xe2\x86\x92 onClose
 *   - ESC key \xe2\x86\x92 onClose
 *   - Mobile: drag handle, swipe ke bawah > 100px dismiss, swipe ke
 *     atas > 50px expand ke 85vh
 *
 * Z-index:
 *   - Backdrop: 1100 (di atas map overlays z-1000, di bawah modal z-2000)
 *   - Panel: 1110
 */

const ACCENT_BAR = {
    online: 'bg-status-online',
    offline: 'bg-status-offline',
    issue: 'bg-status-issue',
    unknown: 'bg-status-unknown',
    primary: 'bg-primary',
};

const SNAP_COLLAPSED_VH = 40;
const SNAP_EXPANDED_VH = 85;
const DRAG_DISMISS_PX = 100;
const DRAG_EXPAND_PX = 50;

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
    const isMobile = useIsMobile();

    // Mobile bottom-sheet drag-snap state
    const [snap, setSnap] = useState('collapsed');
    const [dragOffset, setDragOffset] = useState(0);
    const [isDragging, setIsDragging] = useState(false);
    const dragStartY = useRef(0);

    // Reset snap saat re-open
    useEffect(() => {
        if (isOpen) setSnap('collapsed');
    }, [isOpen]);

    useEffect(() => {
        if (!isOpen) return;

        const onKey = (e) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', onKey);
        panelRef.current?.focus();

        return () => document.removeEventListener('keydown', onKey);
    }, [isOpen, onClose]);

    // Drag handlers (mobile only) \xe2\x80\x94 pointer events untuk touch + mouse
    const onPointerDown = useCallback((e) => {
        dragStartY.current = e.clientY;
        setIsDragging(true);
        e.currentTarget.setPointerCapture?.(e.pointerId);
    }, []);

    const onPointerMove = useCallback(
        (e) => {
            if (!isDragging) return;
            const delta = e.clientY - dragStartY.current;
            // Clamp: kalau collapsed, allow drag atas sampai -100; expanded, no atas
            const clamped = snap === 'expanded' ? Math.max(delta, 0) : Math.max(delta, -100);
            setDragOffset(clamped);
        },
        [isDragging, snap],
    );

    const onPointerUp = useCallback(() => {
        if (!isDragging) return;
        setIsDragging(false);
        const delta = dragOffset;
        setDragOffset(0);

        if (snap === 'expanded') {
            if (delta > DRAG_DISMISS_PX * 2) onClose?.();
            else if (delta > DRAG_EXPAND_PX) setSnap('collapsed');
        } else {
            if (delta > DRAG_DISMISS_PX) onClose?.();
            else if (delta < -DRAG_EXPAND_PX) setSnap('expanded');
        }
    }, [dragOffset, isDragging, snap, onClose]);

    if (!isOpen) return null;

    // Mobile: render bottom-sheet style
    if (isMobile) {
        const snapHeight = snap === 'expanded' ? SNAP_EXPANDED_VH : SNAP_COLLAPSED_VH;
        return (
            <>
                <div
                    className="fixed inset-0 z-[1100] bg-black/60 backdrop-blur-sm"
                    onClick={onClose}
                    aria-hidden="true"
                    style={{
                        opacity: isDragging ? Math.max(0.3, 1 - dragOffset / 400) : 1,
                        transition: 'opacity 200ms ease-out',
                    }}
                />

                <aside
                    ref={panelRef}
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="side-panel-title"
                    tabIndex={-1}
                    className="fixed inset-x-0 bottom-0 z-[1110] flex flex-col bg-surface-dark border-t border-slate-border rounded-t-2xl shadow-2xl outline-none overflow-hidden"
                    style={{
                        height: `${snapHeight}vh`,
                        transform: `translateY(${dragOffset}px)`,
                        transition: isDragging
                            ? 'none'
                            : 'transform 280ms cubic-bezier(0.32, 0.72, 0, 1), height 280ms cubic-bezier(0.32, 0.72, 0, 1)',
                    }}
                >
                    {/* Drag handle bar + header combined.
                        Per review MEDIUM-5: keyboard users tidak bisa expand/
                        collapse pakai drag. Tambah sr-only button toggle. */}
                    <div
                        onPointerDown={onPointerDown}
                        onPointerMove={onPointerMove}
                        onPointerUp={onPointerUp}
                        onPointerCancel={onPointerUp}
                        className="flex-shrink-0 touch-none"
                        style={{ touchAction: 'none' }}
                    >
                        <button
                            type="button"
                            onClick={() =>
                                setSnap((s) => (s === 'expanded' ? 'collapsed' : 'expanded'))
                            }
                            className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-10 focus:px-2 focus:py-1 focus:bg-primary focus:text-white focus:rounded"
                            aria-label={
                                snap === 'expanded'
                                    ? 'Collapse panel ke 40%'
                                    : 'Expand panel ke 85%'
                            }
                        >
                            {snap === 'expanded' ? 'Collapse' : 'Expand'}
                        </button>
                        <div className="pt-2 pb-1">
                            <div
                                className="mx-auto w-12 h-1.5 rounded-full bg-fg-muted/40"
                                aria-hidden="true"
                            />
                        </div>

                        {/* Header */}
                        <div className="relative flex items-start gap-3 px-4 pb-3 border-b border-slate-border">
                            <div
                                className={clsx(
                                    'absolute left-0 top-0 bottom-0 w-1',
                                    ACCENT_BAR[accent] || ACCENT_BAR.primary,
                                )}
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
                                    <p className="text-xs text-fg-muted truncate mt-0.5">
                                        {subtitle}
                                    </p>
                                )}
                            </div>
                            <button
                                type="button"
                                onClick={onClose}
                                aria-label="Tutup panel"
                                title="Tutup (ESC)"
                                className="flex-shrink-0 p-2 rounded-lg text-fg-muted hover:text-fg hover:bg-white/5 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                            >
                                <X className="w-5 h-5" aria-hidden="true" />
                            </button>
                        </div>
                    </div>

                    {/* Body \xe2\x80\x94 scrollable */}
                    <div className="flex-1 overflow-y-auto overscroll-contain custom-scrollbar">
                        {children}
                    </div>

                    {/* Footer */}
                    {footer && (
                        <div className="flex-shrink-0 px-4 py-3 border-t border-slate-border bg-surface-darker/60">
                            {footer}
                        </div>
                    )}
                </aside>
            </>
        );
    }

    // Desktop: slide-in dari kanan (existing)
    return (
        <>
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
                    'w-96 dl-slide-in-right',
                )}
            >
                <div className="relative flex items-start gap-3 px-5 py-4 border-b border-slate-border bg-surface-darker/60">
                    <div
                        className={clsx(
                            'absolute left-0 top-0 bottom-0 w-1',
                            ACCENT_BAR[accent] || ACCENT_BAR.primary,
                        )}
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
                        className="flex-shrink-0 rounded-lg text-fg-muted hover:text-fg hover:bg-white/5 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                    >
                        <X className="w-5 h-5" aria-hidden="true" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar">{children}</div>

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
