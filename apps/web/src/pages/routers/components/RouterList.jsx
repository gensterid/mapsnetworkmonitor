import React from 'react';
import { Link } from 'react-router-dom';
import { RefreshCw, Edit, Trash2, Webhook, ShieldCheck } from 'lucide-react';
import clsx from 'clsx';
import { formatUptime, formatLastSync } from './utils';

export function RouterList({ routers, onEdit, onDelete, onRefresh, refreshingId }) {
    return (
        <div className="bg-slate-900/40 border border-slate-800 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                    <thead className="bg-slate-800/50 text-slate-400 text-[10px] uppercase font-bold tracking-wider">
                        <tr>
                            <th className="px-4 py-3">Status</th>
                            <th className="px-4 py-3">Name</th>
                            <th className="px-4 py-3">IP Address</th>
                            <th className="px-4 py-3">Hardware</th>
                            <th className="px-4 py-3">CPU</th>
                            <th className="px-4 py-3">Memory</th>
                            <th className="px-4 py-3">Uptime</th>
                            <th className="px-4 py-3">Speed</th>
                            <th className="px-4 py-3">Latency</th>
                            <th className="px-4 py-3 text-right">Last Sync</th>
                            <th className="px-4 py-3 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                        {routers.map((router) => (
                            <tr key={router.id} className="hover:bg-slate-800/30 transition-colors group">
                                <td className="px-4 py-3">
                                    <div className="flex flex-col gap-0.5">
                                        <div className="flex items-center gap-2">
                                            <span className={clsx("w-2 h-2 rounded-full",
                                                router.status === 'online' ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" : "bg-red-500"
                                            )}></span>
                                            <span className="text-[10px] text-slate-500 uppercase font-medium">
                                                {router.status === 'online' ? "Online" : "Offline"}
                                            </span>
                                        </div>
                                        {router.status !== 'online' && router.lastErrorMessage && (
                                            <div className="text-[9px] text-red-500/80 italic max-w-[150px] truncate" title={router.lastErrorMessage}>
                                                {router.lastErrorMessage}
                                            </div>
                                        )}
                                    </div>
                                </td>
                                <td className="px-4 py-3">
                                    <div className="flex items-center gap-3">
                                        <Link to={`/routers/${router.id}`} className="text-sm font-medium text-white hover:text-primary transition-colors">
                                            {router.name}
                                        </Link>
                                        <div className="flex items-center gap-1.5">
                                            {router.useWebhook && (
                                                <div className="p-1 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20" title="Webhook Enabled">
                                                    <Webhook className="w-3 h-3" />
                                                </div>
                                            )}
                                            {router.useGenieAcs && (
                                                <div className="p-1 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20" title="GenieACS Enabled">
                                                    <ShieldCheck className="w-3 h-3" />
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </td>
                                <td className="px-4 py-3">
                                    <div className="text-sm text-slate-300 font-mono">{router.host}:{router.port}</div>
                                </td>
                                <td className="px-4 py-3">
                                    <div className="text-sm text-slate-300">{router.model || 'Unknown'}</div>
                                    <div className="text-[10px] text-slate-500">{router.routerOsVersion || router.version || '-'}</div>
                                </td>
                                <td className="px-4 py-3">
                                    <span className={clsx("text-sm font-mono",
                                        (router.latestMetrics?.cpuLoad || 0) > 80 ? "text-red-400" : "text-slate-300"
                                    )}>
                                        {router.latestMetrics?.cpuLoad != null ? `${router.latestMetrics.cpuLoad}%` : '--'}
                                    </span>
                                </td>
                                <td className="px-4 py-3">
                                    <span className="text-sm text-slate-300 font-mono">
                                        {router.latestMetrics?.totalMemory && router.latestMetrics?.usedMemory
                                            ? `${Math.round((router.latestMetrics.usedMemory / router.latestMetrics.totalMemory) * 100)}%`
                                            : '--'}
                                    </span>
                                </td>
                                <td className="px-4 py-3">
                                    <span className="text-sm text-slate-300">
                                        {router.latestMetrics?.uptime ? formatUptime(router.latestMetrics.uptime) : '--'}
                                    </span>
                                </td>
                                <td className="px-4 py-3">
                                    <span className="text-sm text-slate-300">{router.maxInterfaceSpeed || '--'}</span>
                                </td>
                                <td className="px-4 py-3">
                                    <span className={clsx(
                                        "text-sm font-mono font-bold",
                                        router.status !== 'online' ? "text-slate-500" :
                                            (router.latency > 100 ? "text-yellow-500" : "text-emerald-500")
                                    )}>
                                        {router.status === 'online' ? `${router.latency || '--'}ms` : '--'}
                                    </span>
                                </td>
                                <td className="px-4 py-3 text-right">
                                    <span className="text-sm text-slate-400 font-mono">
                                        {formatLastSync(router.lastSeen || router.updatedAt)}
                                    </span>
                                </td>
                                <td className="px-4 py-3">
                                    <div className="flex justify-end gap-1">
                                        <button
                                            onClick={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                onRefresh(router.id);
                                            }}
                                            disabled={refreshingId === router.id}
                                            className="p-1.5 rounded-md hover:bg-slate-700 text-slate-400 hover:text-emerald-400 transition-colors disabled:opacity-50"
                                            title="Refresh connection"
                                        >
                                            <RefreshCw className={clsx("w-4 h-4", refreshingId === router.id && "animate-spin")} />
                                        </button>
                                        <button
                                            onClick={(e) => onEdit(e, router)}
                                            className="p-1.5 rounded-md hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
                                            title="Edit router"
                                        >
                                            <Edit className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={(e) => onDelete(e, router)}
                                            className="p-1.5 rounded-md hover:bg-red-500/10 text-slate-400 hover:text-red-400 transition-colors"
                                            title="Delete router"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

export default RouterList;
