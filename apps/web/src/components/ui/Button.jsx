import React from 'react';
import clsx from 'clsx';
import { Loader2 } from 'lucide-react';

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
    // Variants ikut tema. Foreground token (text-fg, text-fg-muted) bikin
    // teks tetap kontras baik di tema gelap maupun terang (Daylight,
    // Enterprise). Glass overlays bg-white/5 tetap dipakai untuk subtle
    // background; di tema terang mereka jadi sangat tipis tapi border +
    // teks fg tetap memberi struktur tombol.
    const variants = {
        primary: 'bg-primary text-on-primary shadow-lg shadow-primary/20 hover:bg-primary-dark hover:scale-[1.02] border-primary',
        secondary: 'bg-white/5 hover:bg-white/10 text-fg border border-white/10 glass-premium-light',
        destructive: 'bg-danger/10 text-danger hover:bg-danger/20 border border-danger/30',
        ghost: 'hover:bg-white/5 text-fg-muted hover:text-fg',
        outline: 'border border-white/10 bg-transparent hover:bg-white/5 text-fg hover:text-fg glass-premium-light'
    };

    const sizes = {
        default: 'h-10 px-4 py-2',
        sm: 'h-8 px-3 text-xs',
        lg: 'h-12 px-8',
        icon: 'h-10 w-10',
    };

    return (
        <button
            ref={ref}
            type={type}
            className={clsx(
                'inline-flex items-center justify-center rounded-xl font-bold tracking-tight transition-all duration-300 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 disabled:pointer-events-none disabled:opacity-30 border transition-all',
                variants[variant],
                sizes[size],
                className
            )}
            disabled={disabled || loading}
            {...props}
        >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {children}
        </button>
    );
});

Button.displayName = "Button";
