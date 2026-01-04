import React from 'react';
import clsx from 'clsx';

export const Card = ({ className, children, ...props }) => {
    return (
        <div
            className={clsx(
                "rounded-xl border border-slate-700/50 bg-slate-800/40 text-slate-100 shadow-sm backdrop-blur-sm",
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
    <p className={clsx("text-sm text-slate-400", className)} {...props}>
        {children}
    </p>
);
