import React from 'react';
import { Card, CardContent } from '@/components/ui/Card';
import { Monitor, Activity, Globe, Clock } from 'lucide-react';
import clsx from 'clsx';

export default function SummaryTab({ fullDevice }) {
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-left-2 duration-300">
      <div className="space-y-4">
        <Card className="bg-slate-900/40 border-slate-800/80 hover:border-primary/20 transition-colors overflow-hidden">
          <CardContent className="p-4">
            <div className="flex flex-col md:flex-row md:items-center gap-6 min-w-0">
              <div className="flex items-center gap-4 md:w-[28%] shrink-0 min-w-0">
                <div className="p-2.5 bg-blue-500/10 text-blue-400 rounded-xl shrink-0">
                  <Monitor className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="text-[10px] text-slate-500 uppercase font-black tracking-widest mb-1">Identity</div>
                  <div className="text-[12px] text-white font-mono break-all leading-tight">{fullDevice?._id}</div>
                </div>
              </div>
              <div className="flex-1 grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-3 md:border-l md:border-slate-800/50 md:pl-6 py-1 min-w-0">
                <div className="flex flex-col gap-0.5 min-w-0">
                  <span className="text-[10px] text-slate-500 uppercase font-bold tracking-tight">Manufacturer</span>
                  <span className="text-sm text-slate-200 font-medium truncate">{fullDevice?._manufacturer || 'N/A'}</span>
                </div>
                <div className="flex flex-col gap-0.5 min-w-0">
                  <span className="text-[10px] text-slate-500 uppercase font-bold tracking-tight">Product Class</span>
                  <span className="text-sm text-slate-200 font-medium truncate">{fullDevice?._productClass || 'N/A'}</span>
                </div>
                <div className="flex flex-col gap-0.5 min-w-0">
                  <span className="text-[10px] text-slate-500 uppercase font-bold tracking-tight">Serial Number</span>
                  <span className="text-sm text-primary font-mono font-bold truncate">{fullDevice?._serialNumber || 'N/A'}</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/40 border-slate-800/80 hover:border-emerald-500/20 transition-colors overflow-hidden">
          <CardContent className="p-4">
            <div className="flex flex-col md:flex-row md:items-center gap-6 min-w-0">
              <div className="flex items-center gap-4 md:w-[28%] shrink-0 min-w-0">
                <div className="p-2.5 bg-emerald-500/10 text-emerald-400 rounded-xl shrink-0">
                  <Activity className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="text-[10px] text-slate-500 uppercase font-black tracking-widest mb-1">Status</div>
                  <div className="text-sm text-emerald-400 font-bold flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    Online
                  </div>
                </div>
              </div>
              <div className="flex-1 grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-3 md:border-l md:border-slate-800/50 md:pl-6 py-1 min-w-0">
                <div className="flex flex-col gap-0.5 min-w-0">
                  <span className="text-[10px] text-slate-500 uppercase font-bold tracking-tight">System Uptime</span>
                  <span className="text-sm text-white font-bold truncate">{fullDevice?._uptime || 'N/A'}</span>
                </div>
                <div className="flex flex-col gap-0.5 min-w-0">
                  <span className="text-[10px] text-slate-500 uppercase font-bold tracking-tight">Software Version</span>
                  <span className="text-[11px] text-slate-300 font-mono truncate" title={fullDevice?._softwareVersion}>{fullDevice?._softwareVersion || 'N/A'}</span>
                </div>
                <div className="flex flex-col gap-0.5 min-w-0">
                  <span className="text-[10px] text-slate-500 uppercase font-bold tracking-tight">Hardware Revision</span>
                  <span className="text-sm text-slate-300 font-medium truncate">{fullDevice?._hardwareVersion || 'N/A'}</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/40 border-slate-800/80 hover:border-purple-500/20 transition-colors overflow-hidden">
          <CardContent className="p-4">
            <div className="flex flex-col md:flex-row md:items-center gap-6 min-w-0">
              <div className="flex items-center gap-4 md:w-[28%] shrink-0 min-w-0">
                <div className="p-2.5 bg-purple-500/10 text-purple-400 rounded-xl shrink-0">
                  <Globe className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <div className="text-[10px] text-slate-500 uppercase font-black tracking-widest mb-1">Connection</div>
                  <div className="text-[11px] text-white font-mono truncate">{fullDevice?._ip || '0.0.0.0'}</div>
                </div>
              </div>
              <div className="flex-1 grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-3 md:border-l md:border-slate-800/50 md:pl-6 py-1 min-w-0">
                <div className="flex flex-col gap-0.5 min-w-0">
                  <span className="text-[10px] text-slate-500 uppercase font-bold tracking-tight">PPPoE Credentials</span>
                  <span className="text-sm text-primary font-bold truncate">{fullDevice?._pppoeUser || 'N/A'}</span>
                </div>
                <div className="flex flex-col gap-0.5 min-w-0">
                  <span className="text-[10px] text-slate-500 uppercase font-bold tracking-tight">Session Type</span>
                  <span className="text-[11px] text-slate-200 font-medium truncate">{fullDevice?._isTr181 ? 'TR-181' : 'TR-098'}</span>
                </div>
                <div className="flex flex-col gap-0.5 min-w-0">
                  <span className="text-[10px] text-slate-500 uppercase font-bold tracking-tight">Optical Signal</span>
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-sm text-amber-400 font-bold font-mono shrink-0">{fullDevice?._rxPower ? `${fullDevice._rxPower} dBm` : 'N/A'}</span>
                    {fullDevice?._rxPower && (
                      <span className={clsx("w-2 h-2 rounded-full shrink-0", 
                        parseFloat(fullDevice._rxPower) > -27 ? "bg-emerald-500" : "bg-red-500"
                      )} />
                    )}
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="bg-slate-900/30 rounded-xl border border-slate-800 p-6">
        <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
          <Clock className="w-4 h-4 text-primary" />
          TR-069 Session Logs
        </h3>
        <div className="space-y-4">
          <div className="flex items-center gap-4 text-xs text-slate-400">
            <div className="w-24 font-mono">Last Inform</div>
            <div className="flex-1 bg-slate-800/50 h-0.5" />
            <div className="text-white font-medium">{fullDevice?._lastInform ? new Date(fullDevice._lastInform).toLocaleString() : 'N/A'}</div>
          </div>
          <div className="flex items-center gap-4 text-xs text-slate-400">
            <div className="w-24 font-mono">Last Boot</div>
            <div className="flex-1 bg-slate-800/50 h-0.5" />
            <div className="text-slate-300">Synchronized via GenieACS</div>
          </div>
        </div>
      </div>
    </div>
  );
}
