import React from 'react';

const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
        return (
            <div className="bg-slate-800 border border-slate-700 p-2 rounded-lg shadow-xl text-xs">
                <p className="text-slate-300 font-medium mb-1">{label}</p>
                {payload.map((entry, index) => (
                    <div key={index} className="flex items-center gap-2 mb-0.5 last:mb-0">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
                        <span className="text-slate-400 capitalize">{entry.name}:</span>
                        <span className="text-white font-mono font-medium">{entry.value}{entry.unit || ''}</span>
                    </div>
                ))}
            </div>
        );
    }
    return null;
};

export default CustomTooltip;
