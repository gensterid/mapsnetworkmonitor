import React from 'react';
import clsx from 'clsx';

export const Input = React.forwardRef(({ className, error, ...props }, ref) => {
    return (
        <div className="w-full">
            <input
                className={clsx(
                    "flex h-10 w-full rounded-lg border border-slate-700 bg-slate-900/50 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent disabled:cursor-not-allowed disabled:opacity-50 transition-all",
                    error && "border-red-500 focus:ring-red-500",
                    className
                )}
                ref={ref}
                {...props}
            />
            {error && (
                <p className="mt-1 text-xs text-red-400">{error}</p>
            )}
        </div>
    );
});

Input.displayName = "Input";
