import React from 'react';
import clsx from 'clsx';
import { Loader2 } from 'lucide-react';

/**
 * Button — Satu Button component untuk semua action UI di aplikasi (per brief
 * user "satukan semua varian tombol ke satu Button component dengan variants").
 *
 * Variants ikut tema. Foreground token (text-fg, text-fg-muted) bikin teks
 * tetap kontras baik di tema gelap maupun terang.
 *
 * Props:
 *   variant?: 'primary' | 'secondary' | 'destructive' | 'ghost' | 'outline'
 *     primary     — CTA utama (bg-primary blue, shadow glow)
 *     secondary   — Action sekunder (bg subtle, border light)
 *     destructive — Delete / dangerous action (bg-danger tinted red)
 *     ghost       — Tombol minimalist tanpa border (hover bg subtle)
 *     outline     — Outline only, bg transparent
 *
 *   size?: 'default' | 'sm' | 'lg' | 'icon'
 *     default — h-11 px-4 (44px touch target, mobile-friendly)
 *     sm      — h-8 px-3 text-xs (32px, opt-in dense desktop UI only)
 *     lg      — h-12 px-8 (hero CTA, large)
 *     icon    — h-11 w-11 (44x44 icon-only square)
 *
 *   loading?: boolean — show spinner + disable
 *   disabled?: boolean
 *
 *   ref forwarded ke <button>.
 *
 * Usage:
 *   <Button>Save</Button>                                          ← primary default
 *   <Button variant="secondary" size="sm">Cancel</Button>
 *   <Button variant="destructive" loading={isPending}>Delete</Button>
 *   <Button variant="ghost" size="icon" aria-label="Settings"><Settings /></Button>
 */
export const Button = React.forwardRef(({
    className,
    variant = 'primary',
    size = 'default',
    type = 'button',
    loading = false,
    children,
    disabled,
    asChild, // Destructure to prevent passing to DOM
    ...props
}, ref) => {
    const variants = {
        primary: 'bg-primary text-on-primary shadow-lg shadow-primary/20 hover:bg-primary-dark hover:scale-[1.02] border-primary',
        secondary: 'bg-white/5 hover:bg-white/10 text-fg border border-white/10 glass-premium-light',
        destructive: 'bg-danger/10 text-danger hover:bg-danger/20 border border-danger/30',
        ghost: 'hover:bg-white/5 text-fg-muted hover:text-fg',
        outline: 'border border-white/10 bg-transparent hover:bg-white/5 text-fg hover:text-fg glass-premium-light',
    };

    // Touch target spec mobile min 44x44. default h-10 \xe2\x86\x92 h-11 (44px).
    // sm explicit small (h-8 = 32px) opt-in untuk dense desktop UI \xe2\x80\x94
    // operator yang pakai sm tahu konsekuensinya. icon square 44x44.
    const sizes = {
        default: 'h-11 px-4 py-2',
        sm: 'h-8 px-3 text-xs',
        lg: 'h-12 px-8',
        icon: 'h-11 w-11',
    };

    return (
        <button
            ref={ref}
            type={type}
            className={clsx(
                'inline-flex items-center justify-center rounded-xl font-bold tracking-tight active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:pointer-events-none disabled:opacity-30 border transition-all duration-300',
                variants[variant],
                sizes[size],
                className,
            )}
            disabled={disabled || loading}
            aria-busy={loading || undefined}
            {...props}
        >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
            {children}
        </button>
    );
});

Button.displayName = 'Button';
