import React from 'react';
import { Wifi, Settings, Cpu, Thermometer, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import clsx from 'clsx';

/**
 * Enumerate every WLANConfiguration entry on the device. CPEs typically
 * expose WLANConfiguration.1 (2.4G primary), .5 (5G primary on FiberHome
 * V5), plus extra SSIDs at .2/.3/.4/.6/.7/.8 for guest/IPTV/IoT networks.
 *
 * Returns array sorted by index. Each entry: { index, ssid, enabled,
 * channel, band, security, advertised }.
 */
function getWlanConfigs(fullDevice) {
    if (!fullDevice) return [];
    const lan = fullDevice.InternetGatewayDevice?.LANDevice?.[1] || fullDevice.Device?.LANDevice?.[1];
    if (!lan?.WLANConfiguration) return [];

    const configs = [];
    Object.keys(lan.WLANConfiguration).forEach((key) => {
        if (key.startsWith('_')) return;
        if (!/^\d+$/.test(key)) return;
        const wlan = lan.WLANConfiguration[key];
        if (!wlan) return;

        const ssid = wlan.SSID?._value;
        const enabled = wlan.Enable?._value;
        const channel = wlan.Channel?._value;
        const standard = wlan.Standard?._value || wlan['X_HW_HardwareMode']?._value;
        const beacon = wlan.BeaconType?._value;

        // Some firmware (Fiberhome HG6243C) reports SSIDAdvertisementEnabled=false
        // even when the SSID is actually visible on the air. Only treat as
        // not-advertised when BOTH ad flags explicitly say false; otherwise
        // assume the SSID is broadcasting (matches what end-users actually see).
        const advFlag = wlan.SSIDAdvertisementEnabled?._value;
        const beaconAdvFlag = wlan.BeaconAdvertisementEnabled?._value;
        const advertised = !(advFlag === false && beaconAdvFlag === false);

        // Heuristic: Standard '11ac'/'11ax' = 5GHz, else 2.4GHz.
        // Some FiberHome use index 5+ for 5G, ZTE uses index 2 for 5G.
        let band = '2.4G';
        if (standard && /11(ac|ax|a|n5)/i.test(String(standard))) band = '5G';
        else if (parseInt(key) >= 5) band = '5G';

        configs.push({
            index: parseInt(key),
            ssid: ssid || `SSID${key}`,
            enabled: !!enabled,
            channel: channel || 'Auto',
            band,
            security: beacon || 'Unknown',
            advertised,
        });
    });

    return configs.sort((a, b) => a.index - b.index);
}

export default function WifiTab({ fullDevice, onOpenWifiConfig }) {
    const wlans = getWlanConfigs(fullDevice);
    const enabledCount = wlans.filter((w) => w.enabled).length;

    return (
        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
            {/* Hardware Stats — always visible at top */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-800">
                    <div className="flex items-center justify-between mb-2">
                        <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest">SSID Summary</h4>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-[10px] font-bold uppercase gap-1 hover:bg-primary/10 hover:text-primary border border-slate-800"
                            onClick={() => onOpenWifiConfig && onOpenWifiConfig(fullDevice)}
                        >
                            <Settings className="w-3 h-3" />
                            Configure
                        </Button>
                    </div>
                    <div className="flex items-baseline gap-2 mt-2">
                        <span className="text-2xl font-bold text-white">{enabledCount}</span>
                        <span className="text-xs text-slate-500">of {wlans.length} active</span>
                    </div>
                </div>

                <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-800">
                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Hardware Stats</h4>
                    <div className="space-y-3">
                        <div className="flex items-center gap-3">
                            <Cpu className="w-4 h-4 text-orange-400 shrink-0" />
                            <div className="flex-1">
                                <div className="flex justify-between text-[10px] mb-1">
                                    <span className="text-slate-400">CPU Usage</span>
                                    <span className="text-white">Low</span>
                                </div>
                                <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
                                    <div className="bg-emerald-500 h-full w-1/4" />
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <Thermometer className="w-4 h-4 text-red-400 shrink-0" />
                            <div className="flex-1 flex justify-between items-center">
                                <span className="text-[10px] text-slate-400 uppercase font-bold">Temperature</span>
                                <span className="text-sm font-bold text-white">{fullDevice?._temperature || 'N/A'}°C</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* SSID list */}
            {wlans.length === 0 ? (
                <div className="bg-slate-900/40 p-8 rounded-xl border border-slate-800 text-center">
                    <WifiOff className="w-10 h-10 text-slate-700 mx-auto mb-2" />
                    <p className="text-sm text-slate-500">No WLAN configurations found</p>
                    <p className="text-[10px] text-slate-600 mt-1">Try Refresh on the device to pull WiFi tree</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {wlans.map((w) => (
                        <div
                            key={w.index}
                            className={clsx(
                                "p-4 rounded-xl border relative overflow-hidden transition-colors",
                                w.enabled
                                    ? "bg-slate-900/50 border-slate-800 hover:border-primary/30"
                                    : "bg-slate-950/40 border-slate-900/60 opacity-60"
                            )}
                        >
                            <div className="flex items-start justify-between mb-3">
                                <div className="flex items-center gap-2">
                                    <Wifi className={clsx("w-4 h-4", w.enabled ? "text-primary" : "text-slate-600")} />
                                    <span className={clsx(
                                        "text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded",
                                        w.band === '5G' ? "bg-purple-500/10 text-purple-400" : "bg-cyan-500/10 text-cyan-400"
                                    )}>
                                        {w.band}
                                    </span>
                                    <span className="text-[9px] font-mono text-slate-600">#{w.index}</span>
                                </div>
                                <span className={clsx(
                                    "text-[9px] font-bold px-1.5 py-0.5 rounded uppercase",
                                    w.enabled ? "bg-emerald-500/10 text-emerald-500" : "bg-slate-800 text-slate-500"
                                )}>
                                    {w.enabled ? 'On' : 'Off'}
                                </span>
                            </div>
                            <div className="space-y-1.5">
                                <div>
                                    <div className="text-[9px] text-slate-500 uppercase tracking-wider mb-0.5">SSID</div>
                                    <div className={clsx(
                                        "text-sm font-bold truncate",
                                        w.enabled ? "text-white" : "text-slate-500",
                                        !w.advertised && "italic"
                                    )} title={w.ssid}>
                                        {w.ssid}
                                        {!w.advertised && w.enabled && <span className="text-[9px] text-amber-500 ml-1">(hidden)</span>}
                                    </div>
                                </div>
                                <div className="flex justify-between gap-2 text-[10px] pt-1">
                                    <span className="text-slate-500">Channel</span>
                                    <span className="text-slate-300 font-mono">{w.channel}</span>
                                </div>
                                <div className="flex justify-between gap-2 text-[10px]">
                                    <span className="text-slate-500">Security</span>
                                    <span className="text-slate-300 font-mono truncate" title={w.security}>{w.security}</span>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
