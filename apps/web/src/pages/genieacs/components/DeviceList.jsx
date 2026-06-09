import React, { useMemo } from 'react';
import { 
  RefreshCw, 
  Wifi, 
  Info, 
  Database, 
  Power, 
  Activity, 
  Signal, 
  Laptop, 
  Thermometer 
} from 'lucide-react';
import clsx from 'clsx';
import { Badge } from '@/components/ui/Badge';

export default function DeviceList({ 
  devices, 
  selectedIds, 
  onToggleSelect, 
  onToggleSelectAll,
  onViewDetails,
  onRefresh,
  onOpenWifi,
  onBackup,
  onRestore,
  onReboot,
  netwatchLookup,
  getSignalStatusInfo,
  getClientStatusInfo,
  getTempStatusInfo,
  refreshPendingId,
  backupPendingId
}) {
  const now = useMemo(() => Date.now(), []);
  const ONLINE_THRESHOLD = 5 * 60 * 1000;

  const StatusBadge = ({ value, label, colorClass, icon: Icon }) => (
    <div className="flex items-center gap-1.5 min-w-fit">
      {Icon && <Icon className="w-3 h-3 text-fg-muted" />}
      <span className="text-xs font-bold text-fg whitespace-nowrap">{value}</span>
      <span className={clsx("w-1.5 h-1.5 rounded-full shrink-0", colorClass)}></span>
      <span className="text-[10px] text-fg-muted uppercase font-bold tracking-tight">{label}</span>
    </div>
  );

  return (
    <div className="h-full flex flex-col bg-slate-900/40 border border-slate-800 rounded-xl overflow-hidden">
      <div className="flex-1 min-h-0 overflow-auto custom-scrollbar">
        <table className="w-full text-left border-collapse">
          <thead className="sticky top-0 z-10 text-fg-muted text-[10px] uppercase font-bold tracking-wider">
            <tr>
              <th className="px-4 py-3 w-8 bg-slate-800/98 backdrop-blur-sm">
                <input
                  type="checkbox"
                  className="rounded border-slate-700 bg-slate-900 text-primary focus:ring-primary h-4 w-4 cursor-pointer"
                  checked={devices.length > 0 && selectedIds.length === devices.length}
                  onChange={onToggleSelectAll}
                />
              </th>
              <th className="px-4 py-3 bg-slate-800/98 backdrop-blur-sm">Status</th>
              <th className="px-4 py-3 bg-slate-800/98 backdrop-blur-sm">Device / SN</th>
              <th className="px-4 py-3 bg-slate-800/98 backdrop-blur-sm">VLAN</th>
              <th className="px-4 py-3 bg-slate-800/98 backdrop-blur-sm">Model / Type</th>
              <th className="px-4 py-3 bg-slate-800/98 backdrop-blur-sm">MAC / IP Address</th>
              <th className="px-4 py-3 bg-slate-800/98 backdrop-blur-sm">Signal / Clients</th>
              <th className="px-4 py-3 bg-slate-800/98 backdrop-blur-sm">Suhu</th>
              <th className="px-4 py-3 bg-slate-800/98 backdrop-blur-sm">Tags</th>
              <th className="px-4 py-3 text-right bg-slate-800/98 backdrop-blur-sm">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {devices.map((dev) => {
              const lastInformDate = dev._lastInform ? new Date(dev._lastInform) : null;
              const isOnline = lastInformDate && (lastInformDate.getTime() > now - ONLINE_THRESHOLD);

              return (
                <tr
                  key={dev._id}
                  className={clsx(
                    "hover:bg-slate-800/30 transition-colors group h-16",
                    selectedIds.includes(dev._id) && "bg-primary/5"
                  )}
                >
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      className="rounded border-slate-700 bg-slate-900 text-primary focus:ring-primary h-4 w-4 cursor-pointer"
                      checked={selectedIds.includes(dev._id)}
                      onChange={() => onToggleSelect(dev._id)}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className={clsx("w-2 h-2 rounded-full",
                        isOnline
                          ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"
                          : "bg-red-500"
                      )}></span>
                      <span className="text-[10px] text-fg-muted uppercase font-medium">
                        {isOnline ? "Active" : "Idle"}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-sm font-bold text-fg group-hover:text-primary transition-colors cursor-pointer" onClick={() => onViewDetails(dev._id)}>
                      {dev._id}
                    </div>
                    <div className="flex items-center gap-2 overflow-hidden">
                      <div className="text-[10px] text-fg-muted font-mono truncate">
                        SN: {dev._serialNumber || 'N/A'}
                      </div>
                      {dev._serialNumber && netwatchLookup.has(dev._serialNumber) && (
                        <div className="px-1 bg-emerald-500/10 text-emerald-500 text-[8px] font-bold uppercase border border-emerald-500/20 rounded-sm flex items-center gap-0.5 shrink-0" title="Already linked with Netwatch (Location Inherited)">
                          <Activity className="w-2 h-2" />
                          Linked
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {(dev._vlan || '').split(',').map(v => v.trim()).filter(v => v).map(vlan => (
                        <span key={vlan} className="text-primary font-bold text-[10px] font-mono bg-primary/5 px-1 rounded border border-primary/10">
                          {vlan}
                        </span>
                      ))}
                      {!dev._vlan && <span className="text-slate-700 text-[10px] italic">N/A</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-xs font-bold text-fg">{dev._productClass || 'Unknown Model'}</div>
                    <div className="text-[10px] text-fg-muted font-medium uppercase">{dev._hardwareVersion || 'Hardware N/A'}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-[10px] text-fg-muted font-mono font-bold tracking-wider">{dev._mac || 'MAC N/A'}</div>
                    <div className="text-xs text-primary font-mono font-bold">{dev._ip || 'IP N/A'}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-1.5">
                      <StatusBadge {...getSignalStatusInfo(dev._rxPower)} icon={Signal} label="Signal" />
                      <StatusBadge {...getClientStatusInfo(dev._clientCount)} icon={Laptop} label="Clients" />
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge {...getTempStatusInfo(dev._temperature)} icon={Thermometer} label="Temp" />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1 max-w-[150px]">
                      {(dev._tags || []).map(tag => (
                        <Badge key={tag} variant="outline" size="xs" className="text-[8px] bg-slate-950/30 border-slate-800 text-fg-muted px-1 font-bold">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => onRefresh(dev._id)}
                        className="p-2 sm:p-1.5 rounded-md hover:bg-slate-700 text-fg-muted hover:text-blue-400 transition-colors"
                        title="Refresh"
                      >
                        <RefreshCw className={clsx("w-3.5 h-3.5", refreshPendingId === dev._id && "animate-spin")} />
                      </button>
                      <button
                        onClick={() => onOpenWifi(dev)}
                        className="p-2 sm:p-1.5 rounded-md hover:bg-slate-700 text-fg-muted hover:text-emerald-400 transition-colors"
                        title="WiFi"
                      >
                        <Wifi className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => onViewDetails(dev._id)}
                        className="p-2 sm:p-1.5 rounded-md hover:bg-slate-700 text-fg-muted hover:text-primary transition-colors"
                        title="Details"
                      >
                        <Info className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => onBackup(dev._id)}
                        className="p-2 sm:p-1.5 rounded-md hover:bg-slate-700 text-fg-muted hover:text-amber-400 transition-colors"
                        title="Create Backup"
                      >
                        <Database className={clsx("w-3.5 h-3.5", backupPendingId === dev._id && "animate-pulse")} />
                      </button>
                      <button
                        onClick={() => onRestore(dev)}
                        className="p-2 sm:p-1.5 rounded-md hover:bg-slate-700 text-fg-muted hover:text-purple-400 transition-colors"
                        title="Restore Configuration"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => onReboot(dev)}
                        className="p-2 sm:p-1.5 rounded-md hover:bg-slate-700 text-fg-muted hover:text-red-400 transition-colors"
                        title="Reboot Device"
                      >
                        <Power className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
