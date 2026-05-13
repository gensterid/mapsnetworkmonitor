import React from 'react';
import clsx from 'clsx';

function Tabs({ tabs, activeTab, onTabChange }) {
    return (
        <div className="flex gap-1 p-1 bg-slate-800/50 rounded-lg overflow-x-auto no-scrollbar">
            {tabs.map((tab) => (
                <button
                    key={tab.id}
                    onClick={() => onTabChange(tab.id)}
                    className={clsx(
                        "flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors",
                        activeTab === tab.id
                            ? "bg-primary text-[var(--on-primary)]"
                            : "text-slate-400 hover:text-white hover:bg-slate-700/50"
                    )}
                >
                    {tab.icon}
                    {tab.label}
                </button>
            ))}
        </div>
    );
}

export default Tabs;
