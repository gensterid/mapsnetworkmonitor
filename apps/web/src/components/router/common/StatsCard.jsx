import React from 'react';
import { Card, CardContent } from '@/components/ui/Card';
import clsx from 'clsx';

function StatsCard({ icon: Icon, label, value, color = "blue", subValue }) {
    const colorClasses = {
        blue: "bg-blue-500/10 text-blue-400",
        purple: "bg-purple-500/10 text-purple-400",
        green: "bg-emerald-500/10 text-emerald-400",
        orange: "bg-orange-500/10 text-orange-400",
        red: "bg-red-500/10 text-red-400",
    };

    return (
        <Card className="glass-panel h-full">
            <CardContent className="!p-4 h-full flex items-center">
                <div className="flex items-center gap-3 w-full">
                    <div className={clsx("p-2.5 rounded-lg", colorClasses[color])}>
                        <Icon className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-xs text-slate-400">{label}</p>
                        <p className="text-lg font-semibold text-white truncate">{value}</p>
                        {subValue && <p className="text-xs text-slate-500">{subValue}</p>}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}

export default StatsCard;
