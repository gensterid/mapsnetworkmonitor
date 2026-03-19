import React from 'react';
import { Card, CardContent } from './Card';
import clsx from 'clsx';

export function StatsCard({ icon: Icon, label, value, color = "blue", subValue, className }) {
    const colorClasses = {
        blue: "bg-blue-500/10 text-blue-400",
        emerald: "bg-emerald-500/10 text-emerald-400",
        amber: "bg-amber-500/10 text-amber-400",
        orange: "bg-orange-500/10 text-orange-400",
        red: "bg-red-500/10 text-red-400",
        slate: "bg-slate-500/10 text-slate-400",
    };

    return (
        <Card className={clsx("glass-panel h-full border-slate-800/50 bg-slate-900/40 backdrop-blur-sm", className)}>
            <CardContent className="!p-4 h-full flex items-center">
                <div className="flex items-center gap-3 w-full">
                    <div className={clsx("p-2.5 rounded-xl transition-colors duration-300", colorClasses[color])}>
                        <Icon className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-0.5">{label}</p>
                        <p className="text-xl font-bold text-white truncate leading-tight">{value}</p>
                        {subValue && <p className="text-[10px] text-slate-500 mt-0.5 line-clamp-1">{subValue}</p>}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
