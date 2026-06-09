import React from 'react';
import { Network, Globe, ArrowRight } from 'lucide-react';
import clsx from 'clsx';

export default function WanTab({ fullDevice, onOpenWanConfig }) {
  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-right-2 duration-300">
      <div className="bg-slate-900/50 p-4 sm:p-6 rounded-xl border border-slate-800">
        <h4 className="text-xs font-bold text-fg-muted uppercase tracking-widest mb-4">WAN Interface Details</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-1">
          <div className="flex flex-wrap items-center justify-between gap-2 py-2 border-b border-slate-800 min-w-0">
            <span className="text-sm text-fg-muted shrink-0">PPPoE IP</span>
            <span className="text-sm text-primary font-mono font-bold break-all">{fullDevice?._pppoeIp || 'N/A'}</span>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 py-2 border-b border-slate-800 min-w-0">
            <span className="text-sm text-fg-muted shrink-0">Management IP</span>
            <span className="text-sm text-fg font-mono break-all">{fullDevice?._mgmtIp || 'N/A'}</span>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 py-2 border-b border-slate-800 min-w-0">
            <span className="text-sm text-fg-muted shrink-0">Connection Mode</span>
            <span className="text-sm text-fg break-all">{fullDevice?._pppoeUser ? 'PPPoE' : 'Static/DHCP'}</span>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 py-2 border-b border-slate-800 min-w-0">
            <span className="text-sm text-fg-muted shrink-0">MAC Address</span>
            <span className="text-sm text-fg font-mono break-all">{fullDevice?._macAddress || 'N/A'}</span>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 py-2 border-b border-slate-800 min-w-0">
            <span className="text-sm text-fg-muted shrink-0">Status</span>
            <span className={clsx(
              "px-2 py-0.5 text-[10px] font-bold rounded uppercase shrink-0",
              fullDevice?._wanStatus === 'Connected' ? "bg-emerald-500/10 text-emerald-500" : "bg-red-500/10 text-red-500"
            )}>{fullDevice?._wanStatus || 'Disconnected'}</span>
          </div>
        </div>
      </div>

      <div
        className="bg-slate-950/50 p-4 rounded-xl border border-slate-900 flex items-center justify-between group cursor-pointer hover:bg-slate-900 transition-colors"
        onClick={() => onOpenWanConfig && onOpenWanConfig(fullDevice)}
      >
        <div className="flex items-center gap-3">
          <Network className="w-5 h-5 text-primary" />
          <div>
            <div className="text-sm font-bold text-fg">Advanced WAN Management</div>
            <div className="text-[10px] text-fg-muted">Configure VLAN, Bridge, and Routing settings</div>
          </div>
        </div>
        <ArrowRight className="w-5 h-5 text-slate-700 group-hover:text-primary transition-colors" />
      </div>
    </div>
  );
}
