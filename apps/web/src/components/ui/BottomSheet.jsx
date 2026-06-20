import React, { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';

/**
 * BottomSheet — mobile-first drawer dari bawah dengan drag-snap.
 *
 * Spec:
 *   - Muncul di mobile (< 768px) saat marker map di-tap
 *   - Snap ke 40% (collapsed preview) dan 85% (expanded detail) tinggi viewport
 *   - Dismiss: swipe ke bawah (drag past 100px) atau tap backdrop gelap
 *   - Pure CSS transform + transition (tidak pakai library animasi)
 *   - createPortal — escape parent overflow/transform stacking context
 *
 * Render selalu (untuk smooth animation), tapi pastikan parent component
 * hanya mount BottomSheet di mobile breakpoint via useIsMobile() gate.
 *
 * Usage:
 *   const isMobile = useIsMobile();
 *   {isMobile && <BottomSheet isOpen={open} onClose={close} title="..."> ... </BottomSheet>}
 *
 * A11y:
 *   - role="dialog" + aria-modal + aria-labelledby
 *   - ESC key close
 *   - Body scroll lock saat open
 */

const SNAP_COLLAPSED_VH = 40;
const SNAP_EXPANDED_VH = 85;
const DRAG_DISMISS_THRESHOLD_PX = 100;
const DRAG_EXPAND_THRESHOLD_PX = 50;

export default function BottomSheet({
    isOpen,
    onClose,
    title,
    children,
    initialSnap = 'collapsed', // 'collapsed' | 'expanded'
}) {
    // Snap state — start dari initialSnap saat open
    const [snap, setSnap] = useState(initialSnap);
    // Drag offset di pixels (positive = drag bawah, negative = drag atas)
    const [dragOffset, setDragOffset] = useState(0);
    const [isDragging, setIsDragging] = useState(false);
    const dragStartY = useRef(0);
    const sheetRef = useRef(null);

    // Reset snap saat re-open
    useEffect(() => {
        if (isOpen) setSnap(initialSnap);
    }, [isOpen, initialSnap]);

    // ESC key close
    useEffect(() => {
        if (!isOpen) return;
        const handleEsc = (e) => {
            if (e.key === 'Escape') onClose?.();
        };
        document.addEventListener('keydown', handleEsc);
        return () => document.removeEventListener('keydown', handleEsc);
    }, [isOpen, onClose]);

    // Body scroll lock
    useEffect(() => {
        if (!isOpen) return;
        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = prevOverflow;
        };
    }, [isOpen]);

    // Drag handlers — pointer events handle both touch + mouse
    const onPointerDown = useCallback((e) => {
        dragStartY.current = e.clientY;
        setIsDragging(true);
        // Capture pointer supaya drag continue walau cursor keluar sheet
        e.currentTarget.setPointerCapture?.(e.pointerId);
    }, []);

    const onPointerMove = useCallback(
        (e) => {
            if (!isDragging) return;
            const delta = e.clientY - dragStartY.current;
            // Allow drag down freely, drag up clamp ke -100px (kasih sedikit feedback)
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
            // Dari expanded: drag bawah > threshold = collapse, > dismiss threshold = close
            if (delta > DRAG_DISMISS_THRESHOLD_PX * 2) {
                onClose?.();
            } else if (delta > DRAG_EXPAND_THRESHOLD_PX) {
                setSnap('collapsed');
            }
        } else {
            // Dari collapsed: drag bawah > threshold = dismiss, drag atas > threshold = expand
            if (delta > DRAG_DISMISS_THRESHOLD_PX) {
                onClose?.();
            } else if (delta < -DRAG_EXPAND_THRESHOLD_PX) {
                setSnap('expanded');
            }
        }
    }, [dragOffset, isDragging, snap, onClose]);

    if (!isOpen) return null;

    const snapHeight = snap === 'expanded' ? SNAP_EXPANDED_VH : SNAP_COLLAPSED_VH;
    // Translate Y: 0 = fully at snap height. Drag offset push down (positive Y).
    const transform = `translateY(${dragOffset}px)`;

    return createPortal(
        <>
            {/* Backdrop */}
            <div
                onClick={onClose}
                className="fixed inset-0 z-[1150] bg-black/60 backdrop-blur-sm"
                style={{
                    transition: 'opacity 200ms ease-out',
                    opacity: isDragging ? Math.max(0.3, 1 - dragOffset / 400) : 1,
                }}
                aria-hidden="true"
            />

            {/* Sheet */}
            <div
                ref={sheetRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={title ? 'bottom-sheet-title' : undefined}
                className={clsx(
                    'fixed inset-x-0 bottom-0 z-[1160] bg-surface-dark border-t border-slate-border rounded-t-2xl shadow-2xl',
                    'flex flex-col overflow-hidden',
                )}
                style={{
                    height: `${snapHeight}vh`,
                    transform,
                    transition: isDragging
                        ? 'none'
                        : 'transform 280ms cubic-bezier(0.32, 0.72, 0, 1), height 280ms cubic-bezier(0.32, 0.72, 0, 1)',
                }}
            >
                {/* Drag handle area */}
                <div
                    onPointerDown={onPointerDown}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp}
                    onPointerCancel={onPointerUp}
                    className="flex-shrink-0 pt-2 pb-1 cursor-grab active:cursor-grabbing touch-none"
                    style={{ touchAction: 'none' }}
                >
                    <div className="mx-auto w-12 h-1.5 rounded-full bg-fg-muted/40" aria-hidden="true" />
                </div>

                {/* Header */}
                {title && (
                    <div className="flex-shrink-0 px-4 pb-3 border-b border-slate-border">
                        <h2
                            id="bottom-sheet-title"
                            className="text-base font-semibold text-fg truncate"
                        >
                            {title}
                        </h2>
                    </div>
                )}

                {/* Content (scrollable) */}
                <div className="flex-1 overflow-y-auto overscroll-contain custom-scrollbar">
                    {children}
                </div>
            </div>
        </>,
        document.body,
    );
}
