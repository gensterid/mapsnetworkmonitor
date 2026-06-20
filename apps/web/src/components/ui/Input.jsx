import React from 'react';
import clsx from 'clsx';

export const Input = React.forwardRef(({ className, error, ...props }, ref) => {
    // Border + surface + foreground ikut tema via @theme tokens. text-fg
    // = slate-100 di gelap, slate-900 di terang. placeholder pakai
    // text-fg-muted. focus:ring-primary accent ikut tema. Error state
    // pakai --danger biar konsisten (Daylight pakai #dc2626 lebih gelap).
    return (
        <div className="w-full">
            <input
                className={clsx(
                    // h-11 (44px) per mobile touch target spec. text-base
                    // (16px) di mobile mencegah iOS Safari auto-zoom-in saat
                    // focus input (browser zoom kalau text < 16px). md:text-sm
                    // kembali ke 14px di tablet+ untuk density.
                    "flex h-11 w-full rounded-lg border border-slate-border bg-surface-darker/50 px-3 py-2 text-base md:text-sm text-fg placeholder:text-fg-muted focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent disabled:cursor-not-allowed disabled:opacity-50 transition-all",
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
