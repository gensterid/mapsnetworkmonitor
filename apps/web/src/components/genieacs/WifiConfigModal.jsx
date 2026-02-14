import React, { useState, useEffect } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { useUpdateGenieACSWifiConfig, useCreatePreset } from '@/hooks';
import { Wifi, Router, Lock, Eye, EyeOff } from 'lucide-react';
import clsx from 'clsx';

export default function WifiConfigModal({ isOpen, onClose, device }) {
    const [ssidIndex, setSsidIndex] = useState(1);
    const [ssid, setSsid] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);

    // Advanced Info
    const [securityMode, setSecurityMode] = useState('WPA2-PSK');
    const [encryption, setEncryption] = useState('AES');
    const [hidden, setHidden] = useState(false);
    const [channel, setChannel] = useState('Auto');
    const [enable, setEnable] = useState(true);

    const updateWifiMutation = useUpdateGenieACSWifiConfig();
    const createPresetMutation = useCreatePreset();

    useEffect(() => {
        if (isOpen && device) {
            if (ssidIndex === 1) {
                setSsid(device._ssid || '');
            } else {
                setSsid('');
            }
            setPassword('');
            setSecurityMode('WPA2-PSK');
            setEnable(true);
        }
    }, [isOpen, device, ssidIndex]);

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

    const handleSubmit = (e) => {
        e.preventDefault();
        updateWifiMutation.mutate({
            id: device._id,
            config: getFormConfig(),
            routerId: device.routerId
        }, {
            onSuccess: () => onClose()
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
        <Modal isOpen={isOpen} onClose={onClose} title={`WiFi Configuration (${device?._id})`}>
            <form onSubmit={handleSubmit} className="space-y-4 py-2">

                {/* SSID Index Selector */}
                <div className="flex gap-2 p-1 bg-slate-900 rounded-lg">
                    {[1, 2, 3, 4].map((idx) => (
                        <button
                            key={idx}
                            type="button"
                            onClick={() => setSsidIndex(idx)}
                            className={clsx(
                                "flex-1 py-1 text-xs font-medium rounded-md transition-all",
                                ssidIndex === idx
                                    ? "bg-blue-600 text-white shadow-sm"
                                    : "text-slate-400 hover:text-slate-200"
                            )}
                        >
                            SSID {idx}
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

                    <div className="grid grid-cols-2 gap-4">
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
                        loading={updateWifiMutation.isPending}
                    >
                        Save WiFi Settings
                    </Button>
                </div>
            </form>
        </Modal>
    );
}
