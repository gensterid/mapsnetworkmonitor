import React from 'react';
import clsx from 'clsx';

function ProgressBar({ value, color = "blue", label }) {
    const colorClasses = {
        blue: "bg-blue-500",
        purple: "bg-purple-500",
        green: "bg-emerald-500",
        orange: "bg-orange-500",
        red: "bg-red-500",
    };

    return (
        <div className="space-y-1">
            <div className="flex justify-between text-xs">
                <span className="text-slate-400">{label}</span>
                <span className="text-white font-medium">{value}%</span>
            </div>
            <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                <div
                    className={clsx("h-full rounded-full transition-all", colorClasses[color])}
                    style={{ width: `${Math.min(100, value)}%` }}
                />
            </div>
        </div>
    );
}

export default ProgressBar;
