import React, { useState, useEffect, useRef } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { useUpdateGenieACSWifiConfig, useCreatePreset, useGenieACSDevice } from '@/hooks';
import { Wifi, Router, Lock, Eye, EyeOff, Signal, AlertTriangle, RefreshCw } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { formatTimeOnly } from '@/lib/timezone';
import clsx from 'clsx';

export default function WifiConfigModal({ isOpen, onClose, device, routerId }) {
    const [wifiConfigs, setWifiConfigs] = useState([]);
    const [ssidIndex, setSsidIndex] = useState(null);
    const syncLockRef = useRef(false);
    const [lastSyncTime, setLastSyncTime] = useState(Date.now());
    const [ssid, setSsid] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);

    // Advanced Info
    const [securityMode, setSecurityMode] = useState('WPA2-PSK');
    const [encryption, setEncryption] = useState('AES');
    const [hidden, setHidden] = useState(false);
    const [channel, setChannel] = useState('Auto');
    const [enable, setEnable] = useState(true);

    const { data: deviceData } = useGenieACSDevice(device?._id, routerId);

    const updateWifiConfig = useUpdateGenieACSWifiConfig();
    const createPresetMutation = useCreatePreset();

    // Help get Wifi configurations
    function getWifiConfigs(dev) {
        if (!dev) return [];
        const configs = [];
        const isTrue = (val) => val === true || val === 'true' || val === '1' || val === 1;
        
        // Helper — compute hidden conservatively. Some firmware (e.g. Fiberhome
        // HG6243C) sets SSIDAdvertisementEnabled=false even when the SSID is
        // actively broadcasting on the air (verified by WiFi scan). Only treat
        // the SSID as hidden when BOTH advertisement flags agree that it's off.
        // If either explicitly says it's advertising, trust that — the visible
        // beacon is what end-users actually see.
        const isHidden = (config) => {
            const adv = config.SSIDAdvertisementEnabled?._value;
            const beacon = config.BeaconAdvertisementEnabled?._value;
            if (adv === false && beacon === false) return true;
            // Single false flag is unreliable across firmwares; don't claim hidden.
            return false;
        };

        // TR-181 Support
        const tr181SSIDs = dev.Device?.WiFi?.SSID;
        if (tr181SSIDs) {
            Object.keys(tr181SSIDs).forEach(key => {
                if (key.startsWith('_')) return;
                const config = tr181SSIDs[key];
                configs.push({
                    index: parseInt(key),
                    ssid: config.SSID?._value || `WLAN ${key}`,
                    enable: isTrue(config.Enable?._value) || config.Status?._value === 'Enabled',
                    hidden: isHidden(config),
                    securityMode: 'WPA2-PSK',
                    band: parseInt(key) > 4 ? '5GHz' : '2.4GHz'
                });
            });
            if (configs.length > 0) return configs.sort((a,b) => a.index - b.index);
        }

        // TR-098 Support
        const lanDevice = dev.InternetGatewayDevice?.LANDevice?.[1] || dev.Device?.LANDevice?.[1];
        if (lanDevice && lanDevice.WLANConfiguration) {
            Object.keys(lanDevice.WLANConfiguration).forEach(key => {
                if (key.startsWith('_')) return;
                const config = lanDevice.WLANConfiguration[key];

                // Fiberhome/TR-098 logic: Enable and Status are reliable trackers.
                // Status is usually 'Up' when active.
                const isEnabled = isTrue(config.Enable?._value) || config.Status?._value === 'Up';

                configs.push({
                    index: parseInt(key),
                    ssid: config.SSID?._value || `WLAN ${key}`,
                    enable: isEnabled,
                    hidden: isHidden(config),
                    beaconType: config.BeaconType?._value,
                    securityMode: config.BeaconType?._value === 'None' ? 'Open' : 'WPA2-PSK',
                    band: parseInt(key) >= 5 ? '5GHz' : '2.4GHz'
                });
            });
        }
        return configs.sort((a,b) => a.index - b.index);
    }

    useEffect(() => {
        if (deviceData && !syncLockRef.current) {
            const configs = getWifiConfigs(deviceData);
            setWifiConfigs(configs);
            setLastSyncTime(Date.now());
            
            // Auto-select first if none
            if (!ssidIndex && configs.length > 0) {
                setSsidIndex(configs[0].index);
                syncWifiForm(configs[0]);
            } else if (ssidIndex) {
                // Sync currently selected if data changed
                const current = configs.find(c => c.index === parseInt(ssidIndex));
                if (current) syncWifiForm(current);
            }
        }
    }, [deviceData, ssidIndex]);

    const syncWifiForm = (conf) => {
        if (conf) {
            setSsidIndex(conf.index);
            setSsid(conf.ssid || '');
            setEnable(!!conf.enable);
            setHidden(!!conf.hidden);
            setSecurityMode(conf.securityMode || 'WPA2-PSK');
            return true;
        }
        return false;
    };

    const handleCardClick = (conf) => {
        syncLockRef.current = false; // Release lock if user manually switches cards
        setSsidIndex(conf.index);
        syncWifiForm(conf);
    };

    const getFormConfig = () => {
        return {
            ssidIndex: parseInt(ssidIndex),
            enable,
            ssid,
            password,
            securityMode,
            encryption,
            hidden,
            channel: channel === 'Auto' ? 'Auto' : parseInt(channel)
        };
    };

    const handleSave = async () => {
        if (!device) return;
        const config = getFormConfig();
        
        // Lock syncing for 8 seconds to allow ONT to update and ACS to poll
        syncLockRef.current = true;
        
        updateWifiConfig.mutate({
            id: device._id,
            config,
            routerId: routerId
        }, {
            onSuccess: () => {
                toast.success('Settings saved. Syncing with device...');
                setTimeout(() => {
                    syncLockRef.current = false;
                }, 8000);
            },
            onError: () => {
                syncLockRef.current = false;
            }
        });
    };

    const handleSavePreset = () => {
        const name = prompt("Enter a name for this WiFi preset:");
        if (!name) return;

        createPresetMutation.mutate({
            name,
            type: 'wifi',
            config: getFormConfig(),
            description: `WiFi Config (${ssid})`
        });
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={
            <div className="flex flex-col">
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                    WiFi Configuration ({device?._id})
                    {updateWifiConfig.isPending && <RefreshCw className="w-4 h-4 animate-spin text-primary" />}
                </h2>
                <p className="text-[10px] text-slate-500 font-mono uppercase tracking-widest mt-0.5">
                    Last device sync: {formatTimeOnly(lastSyncTime)}
                </p>
            </div>
        } maxWidth="max-w-3xl">
            <form onSubmit={(e) => { e.preventDefault(); handleSave(); }} className="space-y-4 py-2">

                {/* Wireless Management Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2">
                    {wifiConfigs.map((conf) => (
                        <div
                            key={conf.index}
                            onClick={() => handleCardClick(conf)}
                            className={clsx(
                                "flex flex-col p-2 rounded-lg border cursor-pointer transition-all",
                                ssidIndex === conf.index 
                                    ? "bg-blue-600/20 border-blue-500 shadow-md ring-1 ring-blue-500" 
                                    : "bg-slate-900/50 border-slate-800 hover:border-slate-600"
                            )}
                        >
                            <div className="flex justify-between items-start mb-1">
                                <span className="text-[10px] font-bold text-slate-500">#{conf.index}</span>
                                <div className={clsx(
                                    "px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase",
                                    conf.enable ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"
                                )}>
                                    {conf.enable ? 'ON' : 'OFF'}
                                </div>
                            </div>
                            <span className="text-xs font-semibold text-white truncate max-w-full mb-1">
                                {conf.ssid}
                            </span>
                            <div className="flex items-center gap-1 text-[9px] text-slate-400">
                                <Signal size={10} className={conf.band === '5GHz' ? 'text-purple-400' : 'text-blue-400'} />
                                <span>{conf.band}</span>
                            </div>
                        </div>
                    ))}
                </div>

                {/* SSID Index Selector (Mobile/Alternative) */}
                <div className="flex flex-wrap gap-2 p-1 bg-slate-900 rounded-lg">
                    {[1, 2, 3, 4, 5, 6, 7, 8].map((idx) => (
                        <button
                            key={idx}
                            type="button"
                            onClick={() => handleCardClick(wifiConfigs.find(c => c.index === idx) || { index: idx })}
                            className={clsx(
                                "w-[45px] py-1 text-xs font-medium rounded-md transition-all",
                                ssidIndex === idx
                                    ? "bg-blue-600 text-white shadow-sm"
                                    : "text-slate-400 hover:text-slate-200"
                            )}
                        >
                            #{idx}
                        </button>
                    ))}
                </div>

                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <label className="text-sm font-medium text-slate-300">Enable SSID {ssidIndex}</label>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input
                                type="checkbox"
                                className="sr-only peer"
                                checked={enable}
                                onChange={(e) => setEnable(e.target.checked)}
                            />
                            <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                        </label>
                    </div>

                    <div className="space-y-2">
                        <label className="text-xs font-medium text-slate-400">SSID Name</label>
                        <div className="relative">
                            <Wifi className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                            <input
                                type="text"
                                value={ssid}
                                onChange={(e) => setSsid(e.target.value)}
                                className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-10 pr-4 py-2 text-sm text-white focus:ring-1 focus:ring-blue-500 outline-none"
                                placeholder="MyWiFi_Network"
                                required
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-xs font-medium text-slate-400">Password</label>
                        <div className="relative">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                            <input
                                type={showPassword ? "text" : "password"}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className={clsx(
                                    "w-full bg-slate-950 border border-slate-800 rounded-lg pl-10 pr-10 py-2 text-sm text-white focus:ring-1 focus:ring-blue-500 outline-none",
                                    securityMode === 'Open' && "opacity-50 cursor-not-allowed text-slate-500"
                                )}
                                placeholder={securityMode === 'Open' ? "Not required" : "Min 8 characters"}
                                required={securityMode !== 'Open'}
                                disabled={securityMode === 'Open'}
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                                disabled={securityMode === 'Open'}
                            >
                                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>
                        </div>
                    </div>
                </div>

                {/* Advanced Settings */}
                <div className="pt-2 border-t border-slate-800">
                    <p className="text-xs font-semibold text-slate-400 mb-3 uppercase tracking-wider">Advanced Settings</p>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                        <div className="space-y-1">
                            <label className="text-xs text-slate-500">Security Mode</label>
                            <select
                                value={securityMode}
                                onChange={(e) => setSecurityMode(e.target.value)}
                                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 text-xs text-white outline-none"
                            >
                                <option value="WPA2-PSK">WPA2-PSK</option>
                                <option value="WPA-WPA2-Mixed">WPA/WPA2 Mixed</option>
                                <option value="Open">Open (No Password)</option>
                            </select>
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs text-slate-500">Encryption</label>
                            <select
                                value={encryption}
                                onChange={(e) => setEncryption(e.target.value)}
                                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 text-xs text-white outline-none"
                            >
                                <option value="AES">AES</option>
                                <option value="TKIP+AES">TKIP + AES</option>
                            </select>
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs text-slate-500">Channel</label>
                            <select
                                value={channel}
                                onChange={(e) => setChannel(e.target.value)}
                                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2 py-1.5 text-xs text-white outline-none"
                            >
                                <option value="Auto">Auto</option>
                                {[...Array(13)].map((_, i) => (
                                    <option key={i + 1} value={i + 1}>{i + 1}</option>
                                ))}
                            </select>
                        </div>
                        <div className="flex items-center gap-2 mt-4">
                            <input
                                type="checkbox"
                                id="hideSsid"
                                checked={hidden}
                                onChange={(e) => setHidden(e.target.checked)}
                                className="rounded bg-slate-900 border-slate-700 text-blue-600 focus:ring-blue-500"
                            />
                            <label htmlFor="hideSsid" className="text-xs text-slate-400 cursor-pointer select-none">
                                Hidden SSID
                            </label>
                        </div>
                    </div>
                </div>

                <div className="pt-2 flex justify-end gap-2">
                    <Button variant="ghost" onClick={onClose} type="button">Cancel</Button>
                    <Button
                        variant="secondary"
                        type="button"
                        onClick={handleSavePreset}
                        loading={createPresetMutation.isPending}
                    >
                        Save as Preset
                    </Button>
                    <Button
                        variant="primary"
                        type="submit"
                        loading={updateWifiConfig.isPending}
                    >
                        Save WiFi Settings
                    </Button>
                </div>
            </form>
        </Modal>
    );
}
