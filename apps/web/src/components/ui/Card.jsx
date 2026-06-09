import React from 'react';
import clsx from 'clsx';

export const Card = ({ className, children, ...props }) => {
    // Surface + border + foreground ikut tema via CSS vars yang sudah
    // dipetakan di @theme block. text-fg = slate-100 di tema gelap,
    // slate-900 di tema terang (Daylight, Enterprise).
    return (
        <div
            className={clsx(
                "rounded-xl border border-slate-border bg-slate-surface/40 text-fg shadow-sm backdrop-blur-sm",
                className
            )}
            {...props}
        >
            {children}
        </div>
    );
};

export const CardHeader = ({ className, children, ...props }) => (
    <div className={clsx("flex flex-col space-y-1.5 p-6", className)} {...props}>
        {children}
    </div>
);

export const CardTitle = ({ className, children, ...props }) => (
    <h3 className={clsx("font-semibold leading-none tracking-tight", className)} {...props}>
        {children}
    </h3>
);

export const CardContent = ({ className, children, ...props }) => (
    <div className={clsx("p-6 pt-0", className)} {...props}>
        {children}
    </div>
);

export const CardDescription = ({ className, children, ...props }) => (
    <p className={clsx("text-sm text-fg-muted", className)} {...props}>
        {children}
    </p>
);
