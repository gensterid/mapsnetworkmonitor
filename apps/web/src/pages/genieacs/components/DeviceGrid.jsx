import React, { useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/Card';
import { 
  Wifi, 
  RefreshCw, 
  Globe, 
  Info, 
  Database, 
  Power, 
  Signal, 
  Laptop, 
  Thermometer 
} from 'lucide-react';
import clsx from 'clsx';

export default function DeviceGrid({ 
  devices, 
  selectedIds, 
  onToggleSelect, 
  onViewDetails,
  onRefresh,
  onOpenWifi,
  onOpenWan,
  onBackup,
  onRestore,
  onReboot,
  getSignalStatusInfo,
  getClientStatusInfo,
  getTempStatusInfo,
  refreshPendingId,
  backupPendingId
}) {
  const now = useMemo(() => Date.now(), []);
  const ONLINE_THRESHOLD = 5 * 60 * 1000;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
      {devices.map((dev) => {
        const lastInformDate = dev._lastInform ? new Date(dev._lastInform) : null;
        const isOnline = lastInformDate && (lastInformDate.getTime() > now - ONLINE_THRESHOLD);
        
        const signalInfo = getSignalStatusInfo(dev._rxPower);
        const tempInfo = dev._temperature ? getTempStatusInfo(dev._temperature) : null;
        const clientInfo = getClientStatusInfo(dev._clientCount);
        const informAge = lastInformDate ? now - lastInformDate.getTime() : null;
        const informColor = informAge === null ? "bg-slate-700"
            : informAge < 300000 ? "bg-emerald-500"
            : informAge < 3600000 ? "bg-yellow-500"
            : "bg-red-500";

        return (
          <Card
            key={dev._id}
            className={clsx(
              "group transition-all duration-200 relative border overflow-hidden",
              selectedIds.includes(dev._id) ? "border-primary bg-primary/5" : "border-slate-800 hover:border-slate-600"
            )}
          >
            {/* Top inform indicator bar */}
            <div className={clsx("h-0.5 w-full", informColor)} />

            <CardContent className="p-3 space-y-2.5" onClick={(e) => {
              if (e.target.tagName !== 'BUTTON' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'svg' && e.target.tagName !== 'path') {
                onToggleSelect(dev._id);
              }
            }}>
              {/* Header — icon + name + checkbox (compact) */}
              <div className="flex items-start gap-2.5">
                <div className={clsx("p-2 rounded-lg shrink-0",
                  isOnline ? "bg-emerald-500/10 text-emerald-500" : "bg-red-500/10 text-red-500"
                )}>
                  <Wifi className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold text-white text-sm truncate" title={dev._id}>{dev._id}</h3>
                  <div className="flex items-center gap-2 mt-0.5 text-[10px]">
                    <span className="text-primary font-mono truncate" title={dev._serialNumber}>{dev._serialNumber || 'No SN'}</span>
                    <span className="text-slate-600">·</span>
                    <span className="text-slate-400 font-bold uppercase shrink-0">{dev._productClass || '?'}</span>
                  </div>
                </div>
                <input
                  type="checkbox"
                  className="rounded border-slate-700 bg-slate-900 text-primary focus:ring-primary h-4 w-4 cursor-pointer shrink-0 mt-1"
                  checked={selectedIds.includes(dev._id)}
                  onChange={() => onToggleSelect(dev._id)}
                  onClick={(e) => e.stopPropagation()}
                />
              </div>

              {/* Compact info grid — inline label:value, 2 cols */}
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                <div className="flex justify-between gap-1 min-w-0">
                  <span className="text-slate-500 shrink-0">IP</span>
                  <span className="text-slate-200 font-mono truncate" title={dev._ip}>{dev._ip || '—'}</span>
                </div>
                <div className="flex justify-between gap-1">
                  <span className="text-slate-500 shrink-0">RX</span>
                  <div className="flex items-center gap-1">
                    <span className="text-white font-bold font-mono">{signalInfo.value}</span>
                    <span className={clsx("w-1.5 h-1.5 rounded-full shrink-0", signalInfo.color)} />
                  </div>
                </div>
                <div className="flex justify-between gap-1">
                  <span className="text-slate-500 shrink-0">Temp</span>
                  {tempInfo ? (
                    <div className="flex items-center gap-1">
                      <span className="text-white font-bold">{tempInfo.value}</span>
                      <span className={clsx("w-1.5 h-1.5 rounded-full shrink-0", tempInfo.color)} />
                    </div>
                  ) : (
                    <span className="text-slate-700">—</span>
                  )}
                </div>
                <div className="flex justify-between gap-1">
                  <span className="text-slate-500 shrink-0">Clients</span>
                  <div className="flex items-center gap-1">
                    <span className="text-white font-bold">{clientInfo.value}</span>
                    <span className={clsx("w-1.5 h-1.5 rounded-full shrink-0", clientInfo.color)} />
                  </div>
                </div>
                <div className="flex justify-between gap-1 col-span-2 min-w-0">
                  <span className="text-slate-500 shrink-0">VLAN</span>
                  <div className="flex flex-wrap gap-1 justify-end min-w-0">
                    {(dev._vlan || '').split(',').map(v => v.trim()).filter(Boolean).slice(0, 4).map(vlan => (
                      <span key={vlan} className="text-primary font-bold font-mono bg-primary/5 px-1 rounded border border-primary/10 text-[10px]">
                        {vlan}
                      </span>
                    ))}
                    {!dev._vlan && <span className="text-slate-700 italic">—</span>}
                  </div>
                </div>
                <div className="flex justify-between gap-1 col-span-2 min-w-0">
                  <span className="text-slate-500 shrink-0">SSID</span>
                  <span className="text-slate-300 truncate text-right" title={dev._ssid}>{dev._ssid || '—'}</span>
                </div>
                {dev._softwareVersion && (
                  <div className="flex justify-between gap-1 col-span-2 min-w-0">
                    <span className="text-slate-500 shrink-0">FW</span>
                    <span className="text-slate-400 truncate text-right text-[10px] font-mono" title={dev._softwareVersion}>{dev._softwareVersion}</span>
                  </div>
                )}
              </div>

              {/* Tags inline */}
              {dev._tags && dev._tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {dev._tags.slice(0, 4).map(tag => (
                    <span key={tag} className="px-1.5 py-0.5 rounded bg-slate-800/80 text-slate-300 text-[9px] font-bold uppercase tracking-wider border border-slate-700/50">
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              {/* Action bar — always visible, compact horizontal */}
              <div className="flex items-center justify-between gap-1 pt-2 border-t border-slate-800/60 -mx-1">
                <button
                  onClick={(e) => { e.stopPropagation(); onViewDetails(dev._id); }}
                  className="flex-1 p-1.5 rounded text-slate-400 hover:bg-slate-700/50 hover:text-primary transition-colors"
                  title="View Details"
                >
                  <Info className="w-4 h-4 mx-auto" />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); onOpenWifi(dev); }}
                  className="flex-1 p-1.5 rounded text-slate-400 hover:bg-slate-700/50 hover:text-emerald-400 transition-colors"
                  title="WiFi Settings"
                >
                  <Wifi className="w-4 h-4 mx-auto" />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); onOpenWan(dev); }}
                  className="flex-1 p-1.5 rounded text-slate-400 hover:bg-slate-700/50 hover:text-blue-400 transition-colors"
                  title="WAN Settings"
                >
                  <Globe className="w-4 h-4 mx-auto" />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); onRefresh(dev._id); }}
                  className="flex-1 p-1.5 rounded text-slate-400 hover:bg-slate-700/50 hover:text-blue-400 transition-colors"
                  title="Refresh (Summon)"
                >
                  <RefreshCw className={clsx("w-4 h-4 mx-auto", refreshPendingId === dev._id && "animate-spin")} />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); onBackup(dev._id); }}
                  className="flex-1 p-1.5 rounded text-slate-400 hover:bg-slate-700/50 hover:text-amber-400 transition-colors"
                  title="Create Backup"
                >
                  <Database className={clsx("w-4 h-4 mx-auto", backupPendingId === dev._id && "animate-pulse")} />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); onRestore(dev); }}
                  className="flex-1 p-1.5 rounded text-slate-400 hover:bg-slate-700/50 hover:text-purple-400 transition-colors"
                  title="Restore Config"
                >
                  <RefreshCw className="w-4 h-4 mx-auto" />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); onReboot(dev); }}
                  className="flex-1 p-1.5 rounded text-slate-400 hover:bg-slate-700/50 hover:text-red-400 transition-colors"
                  title="Reboot Device"
                >
                  <Power className="w-4 h-4 mx-auto" />
                </button>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
