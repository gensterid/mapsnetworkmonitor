import React from 'react';
import { Card, CardContent } from '@/components/ui/Card';
import clsx from 'clsx';
import { Skeleton } from '@/components/ui/Skeleton';

// eslint-disable-next-line no-unused-vars
/**
 * Accessible StatCard component with ARIA support and glassmorphism design.
 */
function StatCard({ Icon, label, value, subvalue, color = 'primary', onClick, loading = false }) {
    const colorClasses = {
        success: 'text-emerald-400 bg-emerald-500/10',
        danger: 'text-red-400 bg-red-500/10',
        warning: 'text-amber-400 bg-amber-500/10',
        primary: 'text-blue-400 bg-blue-500/10',
    };

    const handleKeyDown = (e) => {
        if (onClick && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            onClick();
        }
    };

    const cardContent = (
        <CardContent className="!p-4 h-full flex items-center">
            <div className="flex items-center gap-3 w-full">
                {loading ? (
                    <Skeleton className="w-10 h-10 rounded-lg shrink-0" aria-hidden="true" />
                ) : (
                    <div 
                        className={clsx("w-10 h-10 rounded-lg flex items-center justify-center shrink-0", colorClasses[color])}
                        aria-hidden="true"
                    >
                        <Icon className="w-5 h-5" />
                    </div>
                )}
                <div className="flex-1">
                    <div className="text-slate-400 text-xs font-medium uppercase tracking-wider">
                        {loading ? <Skeleton className="h-3 w-16 mb-1" /> : label}
                    </div>
                    <div className="text-xl font-bold text-white mt-0.5">
                        {loading ? <Skeleton className="h-6 w-24 mb-1" /> : value}
                    </div>
                    {subvalue && (
                        <div className="text-xs text-slate-500 mt-0.5 font-medium">
                            {loading ? <Skeleton className="h-3 w-32" /> : subvalue}
                        </div>
                    )}
                </div>
            </div>
        </CardContent>
    );

    if (onClick) {
        return (
            <Card
                className="glass-panel cursor-pointer hover:border-slate-600 hover:bg-slate-800/50 transition-all duration-200 hover:-translate-y-0.5 h-full focus:outline-none focus:ring-2 focus:ring-primary/50"
                onClick={onClick}
                onKeyDown={handleKeyDown}
                role="button"
                tabIndex={0}
                aria-label={`Lihat detail ${label}: ${value}`}
            >
                {cardContent}
            </Card>
        );
    }

    return (
        <Card className="glass-panel h-full" role="region" aria-label={label}>
            {cardContent}
        </Card>
    );
}

export default StatCard;
