import React from 'react';
import { useNetworkHealth } from '@/hooks/useAnalytics';
import { useNavigate } from 'react-router-dom';
import { Shield, AlertCircle, Activity, Info } from 'lucide-react';
import './NetworkHealthCard.css';
import clsx from 'clsx';

export default function NetworkHealthCard({ isKiosk = false }) {
    const navigate = useNavigate();
    const { data: health, isLoading, error } = useNetworkHealth();

    if (isLoading) {
        return (
            <div className={clsx("glass-panel rounded-xl p-6 h-full flex flex-col items-center justify-center animate-pulse", isKiosk && "kiosk-panel")}>
                <div className="w-24 h-24 rounded-full border-4 border-slate-800" />
                <div className="h-4 w-32 bg-slate-800 mt-4 rounded" />
            </div>
        );
    }

    if (error || !health) return null;

    const { score, status, breakdown, criticalIssues } = health;
    
    // SVG Properties
    const radius = 50;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (score / 100) * circumference;

    const getStatusColor = () => {
        if (score >= 90) return '#10b981'; // Emerald 500
        if (score >= 75) return '#f59e0b'; // Amber 500
        return '#ef4444'; // Red 500
    };

    return (
        <div className={clsx("glass-panel rounded-xl p-6 flex flex-col gap-6 health-card h-full", isKiosk && "kiosk-panel")}>
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Shield className="w-5 h-5 text-primary" />
                    <h3 className="text-base font-bold text-white tracking-tight">
                        {isKiosk ? 'Node Registry // Status' : 'System Reliability'}
                    </h3>
                </div>
                <div className="flex items-center">
                    <span className={clsx("health-pulse-indicator", `bg-[${getStatusColor()}]`)} style={{ backgroundColor: getStatusColor() }} />
                    <span className={clsx("status-text uppercase font-black tracking-widest text-[10px]", {
                        'status-optimal text-emerald-500': status === 'optimal',
                        'status-warning text-amber-500': status === 'warning',
                        'status-critical text-red-500': status === 'critical'
                    })}>
                        {status === 'optimal' ? 'Stable' : status}
                    </span>
                </div>
            </div>

            <div className="health-ring-container">
                <svg className="health-ring-svg" width="120" height="120" viewBox="0 0 120 120">
                    <circle className="health-ring-bg" cx="60" cy="60" r={radius} />
                    <circle 
                        className="health-ring-progress" 
                        cx="60" cy="60" r={radius}
                        strokeDasharray={circumference}
                        strokeDashoffset={offset}
                        stroke={getStatusColor()}
                    />
                </svg>
                <div className="health-score-value">
                    <div className={clsx("health-score-number", isKiosk ? "kiosk-metric-value text-4xl" : "text-3xl font-bold")} style={{ color: getStatusColor() }}>{score}%</div>
                    <div className="health-score-label text-[10px] uppercase font-black tracking-[0.2em] opacity-40">
                        {isKiosk ? 'SYS_INTEGRITY' : 'Reliability'}
                    </div>
                </div>
            </div>

            <div className="flex flex-col gap-3">
                <button 
                    onClick={() => navigate('/routers')}
                    className="flex justify-between items-center w-full text-xs text-slate-400 hover:text-white transition-colors group cursor-pointer"
                >
                    <div className="flex items-center gap-1.5">
                        <Activity className="w-3 h-3 group-hover:text-primary transition-colors" />
                        <span className={clsx(isKiosk && "font-black tracking-widest uppercase text-[9px]")}>
                            {isKiosk ? 'DATA_NODES' : 'Nodes'}
                        </span>
                    </div>
                    <span className="font-mono bg-slate-800/50 px-2 py-0.5 rounded border border-white/5 group-hover:border-primary/30 group-hover:bg-primary/10 transition-all">
                        {breakdown.routers.total + breakdown.olts.total} Units
                    </span>
                </button>
                
                {criticalIssues.length > 0 ? (
                    <div className="flex flex-col gap-2 mt-2">
                        <p className="text-[10px] uppercase font-black text-slate-500 tracking-widest flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" />
                            {isKiosk ? 'DETERIORATION_FEED' : 'Recent Issues'}
                        </p>
                        <div className="flex flex-col gap-2">
                            {criticalIssues.slice(0, 2).map((issue, i) => (
                                <div key={i} className={clsx("health-issue-item backdrop-blur-md", `severity-${issue.severity}`, isKiosk && "border-l-2")}>
                                    <div className="text-[11px] font-black text-white truncate tracking-tight">{issue.message}</div>
                                    <div className="text-[9px] text-slate-500 uppercase font-black tracking-widest mt-1 opacity-70">
                                        {isKiosk ? `EVT_CODE // ${issue.type}` : issue.type}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ) : (
                    <div className="flex items-center gap-2 p-3 bg-emerald-500/5 rounded-lg border border-emerald-500/10 mt-2">
                        <Shield className="w-4 h-4 text-emerald-500" />
                        <span className="text-[11px] text-emerald-500 font-medium italic">
                            {isKiosk ? 'ALL_SYSTEMS_GO' : 'All systems operating within normal parameters.'}
                        </span>
                    </div>
                )}
            </div>
        </div>
    );
}
