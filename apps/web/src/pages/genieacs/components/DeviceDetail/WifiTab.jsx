import React from 'react';
import { Wifi, Settings, Cpu, Thermometer } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import clsx from 'clsx';

export default function WifiTab({ fullDevice, onOpenWifiConfig }) {
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-slate-900/50 p-5 rounded-xl border border-slate-800 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
            <Wifi className="w-24 h-24" />
          </div>
          <div className="flex justify-between items-start mb-4">
            <h4 className="text-xs font-bold text-primary uppercase tracking-widest">Radio Status (2.4G)</h4>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-[10px] font-bold uppercase gap-1 hover:bg-primary/10 hover:text-primary border border-slate-800"
              onClick={() => onOpenWifiConfig && onOpenWifiConfig(fullDevice)}
            >
              <Settings className="w-3 h-3" />
              Advanced Settings
            </Button>
          </div>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-slate-400">SSID (Broadcast)</span>
              <span className="text-sm text-white font-bold">{fullDevice?._ssid || 'N/A'}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-slate-400">Status</span>
              <span className={clsx(
                "text-[10px] font-bold px-2 py-0.5 rounded uppercase",
                fullDevice?._wifiEnabled ? "bg-emerald-500/10 text-emerald-500" : "bg-slate-800 text-slate-500"
              )}>
                {fullDevice?._wifiEnabled ? 'Enabled' : 'Disabled'}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-slate-400">Channel</span>
              <span className="text-sm text-white font-mono">{fullDevice?._wifiChannel || 'Auto'}</span>
            </div>
          </div>
        </div>

        <div className="bg-slate-900/50 p-5 rounded-xl border border-slate-800">
          <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4">Hardware Stats</h4>
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Cpu className="w-4 h-4 text-orange-400" />
              <div className="flex-1 space-y-1">
                <div className="flex justify-between text-[10px]">
                  <span className="text-slate-400">CPU Usage</span>
                  <span className="text-white">Low</span>
                </div>
                <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
                  <div className="bg-emerald-500 h-full w-1/4" />
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Thermometer className="w-4 h-4 text-red-400" />
              <div className="flex-1 flex justify-between">
                <span className="text-[10px] text-slate-400 uppercase font-bold">Temperature</span>
                <span className="text-sm font-bold text-white">{fullDevice?._temperature || 'N/A'}°C</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
