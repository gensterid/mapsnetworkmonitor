import React from 'react';
import {
    Search,
    RefreshCw,
    AlertCircle,
    Activity,
    Layers,
    Trash2
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import clsx from 'clsx';
import { computeOnuSourceHealth, getSourceHealthLabel, getSourceHealthClasses } from '@/lib/onuSourceHealth';

import OnuTableSkeleton from './OnuTableSkeleton';

export default function OnuTable({
    onus,
    isLoading,
    error,
    refetch,
    searchTerm,
    setSearchTerm,
    onEdit,
    onReboot,
    onArchive,
    netwatchLookup,
    oltType
}) {
    if (isLoading) {
        return <OnuTableSkeleton />;
    }

    const formatOnuId = (ponId, onuId) => {
        if (!ponId || !onuId) return `${ponId}-${onuId}`;

        // HSGQ Style: PON01/0
        if (oltType?.toLowerCase() === 'hsgq') {
            const oId = parseInt(onuId);
            if (!isNaN(oId) && oId >= 256) {
                const portPart = Math.floor(oId / 256);
                const ponNumber = portPart % 256;
                const formattedPon = `PON${String(ponNumber).padStart(2, '0')}`;
                const formattedOnu = oId % 256;
                return `${formattedPon}/${formattedOnu}`;
            }
        }
        return `${ponId}-${onuId}`;
    };

    const getSignalColor = (signal) => {
        if (!signal) return "text-slate-600";
        const numeric = parseFloat(signal);
        if (isNaN(numeric)) return "text-slate-600";
        
        if (numeric >= -25 && numeric <= -12) return "text-emerald-400";
        if (numeric < -25 && numeric >= -28) return "text-amber-400";
        if (numeric < -28 || numeric > -10) return "text-red-400";
        return "text-blue-400";
    };

    const filteredOnus = (onus || []).filter(onu =>
        onu.sn?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        onu.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        onu.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        onu.onuId?.includes(searchTerm) ||
        onu.ponId?.includes(searchTerm)
    );

    if (error) {
        return (
            <div className="py-12 px-6 text-center border border-red-500/10 bg-red-500/5 rounded-xl m-4">
                <AlertCircle className="w-10 h-10 text-red-500 mx-auto mb-3 opacity-50" />
                <p className="text-slate-300 font-bold mb-2">Failed to fetch ONUs</p>
                <p className="text-xs text-slate-500 font-mono mb-6 break-all max-w-md mx-auto">{error.message}</p>
                <Button size="sm" variant="outline" onClick={refetch} className="border-red-500/20 hover:bg-red-500/10 text-red-400">
                    Retry Connection
                </Button>
            </div>
        );
    }

    return (
        <div className="bg-slate-900/40 border-slate-800/50 backdrop-blur-sm rounded-xl overflow-hidden shadow-2xl">
            <div className="p-4 border-b border-slate-800/50 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900/40">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-primary/10 rounded-lg">
                        <Layers className="w-4 h-4 text-primary" />
                    </div>
                    <h3 className="text-sm font-bold text-white uppercase tracking-wider">ONU Management Table</h3>
                </div>
                <div className="relative w-full max-w-xs">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                    <input
                        type="text"
                        placeholder="Search by SN, Name, ID..."
                        className="w-full pl-9 pr-4 py-2 bg-slate-950/50 border border-slate-800 rounded-xl text-xs text-white placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-primary transition-all font-bold"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            {filteredOnus.length === 0 ? (
                <div className="py-20 text-center text-slate-500 font-medium italic">
                    {searchTerm ? `No matches found for "${searchTerm}"` : 'No ONUs discovered on this device.'}
                </div>
            ) : (
                <div className="max-h-[calc(100vh-320px)] min-h-[400px] overflow-auto custom-scrollbar">
                    <table className="w-full border-collapse">
                        <thead className="sticky top-0 z-10">
                            <tr className="border-b border-slate-800">
                                <th className="px-4 py-4 text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap bg-slate-950/98 backdrop-blur-sm">PON / ID</th>
                                <th className="px-4 py-4 text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap bg-slate-950/98 backdrop-blur-sm">SN / Alias</th>
                                <th className="px-4 py-4 text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap bg-slate-950/98 backdrop-blur-sm">MAC Address</th>
                                <th className="px-4 py-4 text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap bg-slate-950/98 backdrop-blur-sm">Note</th>
                                <th className="px-4 py-4 text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap bg-slate-950/98 backdrop-blur-sm">Status / Reason</th>
                                <th className="px-4 py-4 text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap bg-slate-950/98 backdrop-blur-sm">Last Activity</th>
                                <th className="px-4 py-4 text-right text-[10px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap bg-slate-950/98 backdrop-blur-sm">Signal</th>
                                <th className="px-4 py-4 text-left text-[10px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap bg-slate-950/98 backdrop-blur-sm">Location</th>
                                <th className="px-4 py-4 text-right text-[10px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap bg-slate-950/98 backdrop-blur-sm">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/50">
                            {filteredOnus.map((onu, index) => (
                                <tr key={index} className="hover:bg-slate-800/20 transition-colors group">
                                    <td className="px-4 py-4 whitespace-nowrap">
                                        <span className="text-xs font-bold text-white font-mono">{formatOnuId(onu.ponId, onu.onuId)}</span>
                                    </td>
                                    <td className="px-4 py-4 whitespace-nowrap">
                                        <div className="flex flex-col gap-0.5">
                                            <span className="text-xs text-white font-bold font-mono tracking-tight group-hover:text-primary transition-colors">{onu.sn}</span>
                                            {onu.name && <span className="text-[10px] text-slate-500 font-bold uppercase truncate max-w-[120px]" title={onu.name}>{onu.name}</span>}
                                        </div>
                                    </td>
                                    <td className="px-4 py-4 whitespace-nowrap">
                                        {onu.macAddress ? (
                                            <span className="text-[10px] font-bold px-2 py-0.5 bg-slate-950/50 text-slate-400 rounded border border-slate-800 font-mono tracking-widest">
                                                {onu.macAddress}
                                            </span>
                                        ) : (
                                            <span className="text-[10px] text-slate-700 font-mono">-</span>
                                        )}
                                    </td>
                                    <td className="px-4 py-4 whitespace-nowrap">
                                        <span className="text-[10px] text-slate-500 font-medium italic truncate max-w-[150px] block" title={onu.description || ''}>
                                            {onu.description || '--'}
                                        </span>
                                    </td>
                                    <td className="px-4 py-4 whitespace-nowrap">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <Badge variant={onu.status === 'online' ? 'success' : 'destructive'} size="xs" className="font-black">
                                                {onu.status}
                                            </Badge>
                                            {onu.lastDownReason && (
                                                <span className={clsx(
                                                    "px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-tight",
                                                    onu.lastDownReason === 'Power Down' ? "bg-amber-500/10 text-amber-500 border border-amber-500/10" :
                                                        onu.lastDownReason === 'Optical Loss' ? "bg-orange-500/10 text-orange-500 border border-orange-500/10" :
                                                            "bg-slate-800 text-slate-500"
                                                )}>
                                                    {onu.lastDownReason}
                                                </span>
                                            )}
                                            {(() => {
                                                const health = computeOnuSourceHealth(onu);
                                                if (health.kind === 'na' || health.kind === 'healthy') return null;
                                                return (
                                                    <span
                                                        className={clsx(
                                                            "px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-tight",
                                                            getSourceHealthClasses(health.kind)
                                                        )}
                                                        title={
                                                            health.kind === 'ghost'
                                                                ? 'OLT dan ACS sudah tidak melaporkan ONU ini — kandidat untuk dihapus dari aplikasi'
                                                                : health.kind === 'missing-olt'
                                                                    ? 'OLT tidak melaporkan ONU ini dalam 2 jam terakhir'
                                                                    : 'ACS tidak melaporkan ONU ini dalam 2 jam terakhir'
                                                        }
                                                    >
                                                        {getSourceHealthLabel(health.kind)}
                                                    </span>
                                                );
                                            })()}
                                        </div>
                                    </td>
                                    <td className="px-4 py-4 whitespace-nowrap text-xs">
                                        <div className="flex flex-col">
                                            <span className="text-slate-300 font-medium">{onu.lastDownTime || '--'}</span>
                                            {onu.status === 'online' && onu.lastUpTime && (
                                                <span className="text-emerald-500/60 text-[9px] font-bold uppercase">Uptime: {onu.lastUpTime}</span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-4 py-4 whitespace-nowrap text-right">
                                        <span className={clsx(
                                            "text-xs font-bold font-mono",
                                            onu.status === 'online' ? getSignalColor(onu.signal) : "text-slate-700"
                                        )}>
                                            {onu.signal || '--'}
                                        </span>
                                    </td>
                                    <td className="px-4 py-4 whitespace-nowrap">
                                        <div className="flex items-center gap-2">
                                            {onu.latitude && onu.longitude ? (
                                                <a
                                                    href={`https://www.google.com/maps?q=${onu.latitude},${onu.longitude}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="p-1.5 bg-blue-500/10 text-blue-400 rounded-lg hover:bg-blue-500/20 transition-colors"
                                                    title="View on Maps"
                                                >
                                                    <Activity className="w-3.5 h-3.5" />
                                                </a>
                                            ) : (netwatchLookup.has(onu.sn) || netwatchLookup.has(onu.host)) ? (
                                                <div className="flex items-center gap-1.5 text-emerald-500 bg-emerald-500/5 px-2 py-1 rounded-lg border border-emerald-500/10 cursor-help" title="Location is inherited from linked Netwatch entry">
                                                    <Activity className="w-3 h-3 animate-pulse" />
                                                    <span className="text-[9px] font-bold uppercase">Linked</span>
                                                </div>
                                            ) : (
                                                <span className="text-[10px] text-slate-700 italic font-medium">Not set</span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 whitespace-nowrap">
                                        <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                className="h-8 text-[10px] font-bold text-red-400 hover:text-red-300 hover:bg-red-500/10 uppercase tracking-wider"
                                                onClick={() => onReboot(onu)}
                                            >
                                                Reboot
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                className="h-8 text-[10px] font-bold text-primary hover:bg-primary/10 uppercase tracking-wider"
                                                onClick={() => onEdit(onu)}
                                            >
                                                Edit
                                            </Button>
                                            {onArchive && (
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    className="h-8 w-8 p-0 text-orange-400 hover:text-orange-300 hover:bg-orange-500/10"
                                                    title="Hapus dari aplikasi (bisa dikembalikan jika ONU muncul kembali di polling)"
                                                    onClick={() => onArchive(onu)}
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </Button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
