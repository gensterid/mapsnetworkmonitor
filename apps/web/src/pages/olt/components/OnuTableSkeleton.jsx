import React from 'react';

export default function OnuTableSkeleton() {
    return (
        <div className="bg-slate-900/40 border border-slate-800/50 backdrop-blur-sm rounded-xl overflow-hidden shadow-2xl animate-pulse">
            <div className="p-4 border-b border-slate-800/50 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900/40">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-slate-800 rounded-lg"></div>
                    <div className="w-32 h-4 bg-slate-800 rounded"></div>
                </div>
                <div className="w-full max-w-xs h-9 bg-slate-950/50 border border-slate-800 rounded-xl"></div>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                    <thead>
                        <tr className="bg-slate-950/30 border-b border-slate-800">
                            {[...Array(8)].map((_, i) => (
                                <th key={i} className="px-4 py-4"><div className="w-16 h-3 bg-slate-800 rounded"></div></th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/50">
                        {[...Array(5)].map((_, i) => (
                            <tr key={i}>
                                {[...Array(8)].map((_, j) => (
                                    <td key={j} className="px-4 py-6">
                                        <div className="w-20 h-4 bg-slate-800 rounded-md"></div>
                                        {j === 1 && <div className="w-12 h-2 bg-slate-800/50 rounded mt-1.5"></div>}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
