import React from 'react';
import clsx from 'clsx';

export const Input = React.forwardRef(({ className, error, ...props }, ref) => {
    // Border + surface ikut tema via @theme tokens. focus:ring-primary
    // sudah ada — accent ring ikut --primary tiap tema. Error state
    // pakai --danger biar konsisten (Daylight pakai #dc2626 yang lebih
    // gelap untuk kontras di bg putih). text-white masih hardcode —
    // di Daylight kurang kontras, akan ditangani saat token foreground
    // per-tema (--text-base) tersedia.
    return (
        <div className="w-full">
            <input
                className={clsx(
                    "flex h-10 w-full rounded-lg border border-slate-border bg-surface-darker/50 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent disabled:cursor-not-allowed disabled:opacity-50 transition-all",
                    error && "border-danger focus:ring-danger",
                    className
                )}
                ref={ref}
                {...props}
            />
            {error && (
                <p className="mt-1 text-xs text-danger">{error}</p>
            )}
        </div>
    );
});

Input.displayName = "Input";
