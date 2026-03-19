import React from 'react';
import clsx from 'clsx';

/**
 * Skeleton component for loading states.
 * Provides a shimmering box that mimics the shape of the content being loaded.
 */
export const Skeleton = ({ className, ...props }) => {
    return (
        <div
            className={clsx(
                "animate-pulse rounded-md bg-white/5",
                className
            )}
            {...props}
        />
    );
};

export const CardSkeleton = () => (
    <div className="bg-white/5 backdrop-blur-md rounded-xl p-6 border border-white/10 h-32 flex flex-col justify-between">
        <Skeleton className="h-4 w-1/3" />
        <Skeleton className="h-8 w-2/3" />
    </div>
);

export const ChartSkeleton = () => (
    <div className="bg-white/5 backdrop-blur-md rounded-xl p-6 border border-white/10 h-80 flex flex-col gap-4">
        <Skeleton className="h-6 w-1/4" />
        <div className="flex-1 flex items-end gap-2">
            {[...Array(12)].map((_, i) => (
                <Skeleton 
                    key={i} 
                    className="flex-1" 
                    style={{ height: `${Math.floor(Math.random() * 60) + 20}%` }} 
                />
            ))}
        </div>
    </div>
);

export const ListSkeleton = ({ rows = 5 }) => (
    <div className="space-y-4">
        {[...Array(rows)].map((_, i) => (
            <div key={i} className="flex items-center gap-4">
                <Skeleton className="h-12 w-12 rounded-full" />
                <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-1/4" />
                    <Skeleton className="h-3 w-3/4" />
                </div>
            </div>
        ))}
    </div>
);
