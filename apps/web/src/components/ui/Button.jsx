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
    ...props
}, ref) => {
    const variants = {
        primary: 'bg-primary hover:bg-primary-600 text-white shadow-lg shadow-blue-500/20',
        secondary: 'bg-slate-700 hover:bg-slate-600 text-white',
        destructive: 'bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20',
        ghost: 'hover:bg-slate-700/50 text-slate-300 hover:text-white',
        outline: 'border border-slate-700 bg-transparent hover:bg-slate-800 text-slate-300 hover:text-white'
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
                'inline-flex items-center justify-center rounded-lg font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:pointer-events-none disabled:opacity-50',
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
