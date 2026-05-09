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
        
        return (
          <Card
            key={dev._id}
            className={clsx(
              "group transition-all duration-200 relative border",
              selectedIds.includes(dev._id) ? "border-primary bg-primary/5" : "border-slate-800 hover:border-slate-600"
            )}
          >
            <div className="absolute top-3 right-3 z-10">
              <input
                type="checkbox"
                className="rounded border-slate-700 bg-slate-900 text-primary focus:ring-primary h-4 w-4 cursor-pointer"
                checked={selectedIds.includes(dev._id)}
                onChange={() => onToggleSelect(dev._id)}
              />
            </div>

            <CardContent className="p-5 space-y-4" onClick={(e) => {
              if (e.target.tagName !== 'BUTTON' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'svg' && e.target.tagName !== 'path') {
                onToggleSelect(dev._id);
              }
            }}>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className={clsx("p-2.5 rounded-lg",
                    isOnline
                      ? "bg-emerald-500/10 text-emerald-500"
                      : "bg-red-500/10 text-red-500"
                  )}>
                    <Wifi className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-white truncate w-32" title={dev._id}>{dev._id}</h3>
                    <div className="flex flex-col gap-0.5">
                      <div className="text-[10px] text-primary font-mono">{dev._serialNumber || 'No SN'}</div>
                      <div className="flex items-center gap-2">
                        <div className="text-[10px] text-slate-400 font-bold">{dev._productClass || 'Unknown Model'}</div>
                        <span className={clsx("w-1.5 h-1.5 rounded-full",
                          isOnline ? "bg-emerald-500" : "bg-red-500"
                        )} title={isOnline ? "Online" : "Offline"}></span>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity mr-10">
                  <button
                    onClick={(e) => { e.stopPropagation(); onRefresh(dev._id); }}
                    className="p-1.5 rounded-md hover:bg-slate-700 text-slate-400 hover:text-blue-400 transition-colors"
                    title="Refresh (Summon)"
                  >
                    <RefreshCw className={clsx("w-4 h-4", refreshPendingId === dev._id && "animate-spin")} />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); onOpenWifi(dev); }}
                    className="p-1.5 rounded-md hover:bg-slate-700 text-slate-400 hover:text-emerald-400 transition-colors"
                    title="WiFi Settings"
                  >
                    <Wifi className="w-4 h-4" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); onOpenWan(dev); }}
                    className="p-1.5 rounded-md hover:bg-slate-700 text-slate-400 hover:text-blue-400 transition-colors"
                    title="WAN Settings"
                  >
                    <Globe className="w-4 h-4" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); onViewDetails(dev._id); }}
                    className="p-1.5 rounded-md hover:bg-slate-700 text-slate-400 hover:text-primary transition-colors"
                    title="View Details"
                  >
                    <Info className="w-4 h-4" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); onBackup(dev._id); }}
                    className="p-1.5 rounded-md hover:bg-slate-700 text-slate-400 hover:text-amber-400 transition-colors"
                    title="Create Backup"
                  >
                    <Database className={clsx("w-4 h-4", backupPendingId === dev._id && "animate-pulse")} />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); onRestore(dev); }}
                    className="p-1.5 rounded-md hover:bg-slate-700 text-slate-400 hover:text-purple-400 transition-colors"
                    title="Restore Config"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); onReboot(dev); }}
                    className="p-1.5 rounded-md hover:bg-slate-700 text-slate-400 hover:text-red-400 transition-colors"
                    title="Reboot Device"
                  >
                    <Power className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-y-3 gap-x-2 text-sm">
                <div className="flex flex-col">
                  <span className="text-slate-500 text-xs font-bold uppercase tracking-wider">IP Address</span>
                  <span className="text-slate-300 font-mono text-xs">{dev._ip || 'N/A'}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-slate-500 text-xs font-bold uppercase tracking-wider">RX Power</span>
                  {(() => {
                    const info = getSignalStatusInfo(dev._rxPower);
                    return (
                      <div className="flex items-center gap-1 mt-0.5">
                        <span className="text-xs font-bold text-white">{info.value}</span>
                        <span className={clsx("w-1.5 h-1.5 rounded-full", info.color)}></span>
                      </div>
                    );
                  })()}
                </div>
                <div className="flex flex-col">
                  <span className="text-slate-500 text-xs font-bold uppercase tracking-wider">Temp / Clients</span>
                  <div className="flex flex-col gap-1 mt-0.5">
                    {dev._temperature && (() => {
                      const info = getTempStatusInfo(dev._temperature);
                      return (
                        <div className="flex items-center gap-1">
                          <span className="text-[11px] font-bold text-white">{info.value}</span>
                          <span className={clsx("w-1 h-1 rounded-full", info.color)}></span>
                        </div>
                      );
                    })()}
                    {(() => {
                      const info = getClientStatusInfo(dev._clientCount);
                      return (
                        <div className="flex items-center gap-1">
                          <span className="text-[11px] font-bold text-white">{info.value}</span>
                          <span className={clsx("w-1 h-1 rounded-full", info.color)}></span>
                        </div>
                      );
                    })()}
                  </div>
                </div>
                <div className="flex flex-col">
                  <span className="text-slate-500 text-xs font-bold uppercase tracking-wider">Firmware</span>
                  <span className="text-slate-400 text-[10px] truncate" title={dev._softwareVersion}>
                    {dev._softwareVersion || 'Unknown'}
                  </span>
                </div>
                <div className="flex flex-col">
                  <span className="text-slate-500 text-xs font-bold uppercase tracking-wider">VLAN</span>
                  <div className="flex flex-wrap gap-1 mt-0.5">
                    {(dev._vlan || '').split(',').map(v => v.trim()).filter(v => v).map(vlan => (
                      <span key={vlan} className="text-primary font-bold text-[10px] font-mono bg-primary/5 px-1 rounded border border-primary/10">
                        {vlan}
                      </span>
                    ))}
                    {!dev._vlan && <span className="text-slate-700 text-[10px] italic">N/A</span>}
                  </div>
                </div>
                <div className="col-span-2 flex flex-col pt-1">
                  <span className="text-slate-500 text-xs font-bold uppercase tracking-wider">SSID</span>
                  <span className="text-slate-300 truncate text-xs" title={dev._ssid}>{dev._ssid || 'N/A'}</span>
                </div>
              </div>

              {dev._tags && dev._tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {dev._tags.map(tag => (
                    <span
                      key={tag}
                      className="px-2 py-0.5 rounded-md bg-slate-800/80 text-slate-300 text-[9px] font-bold uppercase tracking-wider border border-slate-700/50"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              {lastInformDate && (
                <div className="pt-2">
                  <div className={clsx(
                    "h-1 rounded-full w-full",
                    now - lastInformDate.getTime() < 300000
                      ? "bg-emerald-500"
                      : now - lastInformDate.getTime() < 3600000
                        ? "bg-yellow-500"
                        : "bg-red-500"
                  )} />
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
