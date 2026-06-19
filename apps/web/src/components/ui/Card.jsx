import React from 'react';
import clsx from 'clsx';

/**
 * Card — Container surface dengan variants + padding control.
 *
 * Satu Card component untuk semua surface pattern di aplikasi (per brief user
 * "satukan semua card ke satu Card component"). Variant + padding prop bikin
 * 1 component cover berbagai use case tanpa harus bikin file terpisah.
 *
 * Surface + border + foreground ikut tema via CSS vars di @theme block.
 * text-fg = slate-100 di tema gelap, slate-900 di tema terang.
 *
 * Props:
 *   variant?: 'default' | 'compact' | 'elevated' | 'outlined' | 'inset'
 *     default  — Surface utama: bg slate-surface/40 + border + subtle shadow (default existing)
 *     compact  — Sama dengan default, beda di padding (kalau pakai padding='sm')
 *     elevated — Stronger shadow + slight bg lift; untuk modal-like prominent surface
 *     outlined — Transparent bg, cuma border + text; untuk grouped sections
 *     inset    — Darker bg (surface-darker), no shadow; untuk nested card di dalam Card lain
 *
 *   padding?: 'default' | 'sm' | 'lg' | 'none'
 *     Mengatur CardContent default padding (Card root tetap p-0).
 *     default — p-6 (existing CardContent)
 *     sm      — p-4 (untuk dense info)
 *     lg      — p-8 (untuk hero card)
 *     none    — no padding (kalau child sudah handle padding sendiri)
 *
 * Backward compat: tanpa variant + padding prop, render sama persis dengan
 * existing usage (semua 88 file yang sudah pakai Card tidak break).
 *
 * Usage:
 *   <Card>...</Card>                              ← default (current behavior)
 *   <Card variant="elevated">...</Card>           ← prominent surface
 *   <Card variant="outlined" padding="sm">...</Card>  ← grouped section, compact
 *   <Card variant="inset">...</Card>              ← nested card
 */

const VARIANT_CLASSES = {
    default: 'bg-slate-surface/40 border-slate-border shadow-sm backdrop-blur-sm',
    compact: 'bg-slate-surface/40 border-slate-border shadow-sm backdrop-blur-sm',
    elevated: 'bg-slate-surface/60 border-slate-border shadow-lg shadow-black/20 backdrop-blur-md',
    outlined: 'bg-transparent border-slate-border',
    inset: 'bg-surface-darker/60 border-slate-border/50 backdrop-blur-sm',
};

export const Card = ({ className, variant = 'default', children, ...props }) => {
    return (
        <div
            data-card-variant={variant}
            className={clsx(
                'rounded-xl border text-fg',
                VARIANT_CLASSES[variant] || VARIANT_CLASSES.default,
                className,
            )}
            {...props}
        >
            {children}
        </div>
    );
};

export const CardHeader = ({ className, children, ...props }) => (
    <div className={clsx('flex flex-col space-y-1.5 p-6', className)} {...props}>
        {children}
    </div>
);

export const CardTitle = ({ className, children, ...props }) => (
    <h3 className={clsx('font-semibold leading-none tracking-tight', className)} {...props}>
        {children}
    </h3>
);

const PADDING_CLASSES = {
    default: 'p-6 pt-0',
    sm: 'p-4 pt-0',
    lg: 'p-8 pt-0',
    none: 'p-0',
};

export const CardContent = ({ className, padding = 'default', children, ...props }) => (
    <div className={clsx(PADDING_CLASSES[padding] || PADDING_CLASSES.default, className)} {...props}>
        {children}
    </div>
);

export const CardDescription = ({ className, children, ...props }) => (
    <p className={clsx('text-sm text-fg-muted', className)} {...props}>
        {children}
    </p>
);

/**
 * CardFooter — Optional sticky footer untuk action buttons di Card.
 * Border-top sebagai visual separator. Padding match CardContent default.
 */
export const CardFooter = ({ className, children, ...props }) => (
    <div className={clsx('flex items-center justify-end gap-2 p-6 pt-4 border-t border-slate-border/60', className)} {...props}>
        {children}
    </div>
);
