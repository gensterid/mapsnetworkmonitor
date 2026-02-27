import React, { useState, useEffect } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { useUpdateGenieACSWanConfig, useCreatePreset } from '@/hooks';
import { Globe, Server, Key, User, Activity, Network } from 'lucide-react';
import clsx from 'clsx';

export default function WanConfigModal({ isOpen, onClose, device }) {
    const [wanType, setWanType] = useState('pppoe');
    const [connectionMode, setConnectionMode] = useState('route'); // route | bridge
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [vlanId, setVlanId] = useState('');
    const [hasVlan, setHasVlan] = useState(false);

    // IP Config
    const [addressingType, setAddressingType] = useState('DHCP');
    const [ipAddress, setIpAddress] = useState('');
    const [subnetMask, setSubnetMask] = useState('');
    const [defaultGateway, setDefaultGateway] = useState('');
    const [dnsServers, setDnsServers] = useState('');

    // Port Binding
    const [bindPorts, setBindPorts] = useState([]); // ['LAN1', 'LAN2', 'LAN3', 'LAN4', 'SSID1']

    const updateWanMutation = useUpdateGenieACSWanConfig();
    const createPresetMutation = useCreatePreset();

    useEffect(() => {
        if (isOpen && device) {
            setWanType('pppoe');
            setUsername('');
            setPassword('');
            setVlanId('');
            setHasVlan(false);
            setBindPorts([]);

            // Heuristics could go here
        }
    }, [isOpen, device]);

    const getFormConfig = () => {
        const config = {
            wanType,
            connectionMode,
            connectionIndex: 1, // Default to 1 for now
            enable: true
        };

        if (hasVlan && vlanId) {
            config.vlanId = parseInt(vlanId);
        }

        if (wanType === 'pppoe') {
            config.username = username;
            config.password = password;
        } else {
            config.addressingType = addressingType;
            if (addressingType === 'Static') {
                config.ipAddress = ipAddress;
                config.subnetMask = subnetMask;
                config.defaultGateway = defaultGateway;
                config.dnsServers = dnsServers;
            }
        }

        if (bindPorts.length > 0) {
            config.bindPorts = bindPorts.join(',');
        }

        return config;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!device) return;

        updateWanMutation.mutate({
            id: device._id,
            config: getFormConfig(),
            routerId: device.routerId
        }, {
            onSuccess: () => onClose()
        });
    };

    const handleSavePreset = () => {
        const name = prompt("Enter a name for this WAN preset:");
        if (!name) return;

        createPresetMutation.mutate({
            name,
            type: 'wan',
            config: getFormConfig(),
            description: `WAN Config (${wanType})`
        });
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`WAN Configuration (${device?._id})`}>
            <form onSubmit={handleSubmit} className="space-y-4 py-2">

                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                        <label className="text-xs font-medium text-slate-400">Connection Type</label>
                        <select
                            value={wanType}
                            onChange={(e) => setWanType(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                        >
                            <option value="pppoe">PPPoE (Username/Password)</option>
                            <option value="ip">IP (Static/DHCP)</option>
                        </select>
                    </div>
                    <div className="space-y-1">
                        <label className="text-xs font-medium text-slate-400">Internet Mode</label>
                        <select
                            value={connectionMode}
                            onChange={(e) => setConnectionMode(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                        >
                            <option value="route">Route (Internet)</option>
                            <option value="bridge">Bridge (Hotspot)</option>
                        </select>
                    </div>
                </div>

                {/* PPPoE Settings */}
                {wanType === 'pppoe' && (
                    <div className="space-y-3 bg-slate-950/50 p-4 rounded-xl border border-slate-800">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-300">PPPoE Username</label>
                            <div className="relative">
                                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                                <input
                                    type="text"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-10 pr-4 py-2 text-sm text-white focus:ring-1 focus:ring-primary outline-none"
                                    placeholder="user@isp"
                                />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-300">PPPoE Password</label>
                            <div className="relative">
                                <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                                <input
                                    type="text" // Show password for easier debugging usually, or toggle
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-10 pr-4 py-2 text-sm text-white focus:ring-1 focus:ring-primary outline-none"
                                    placeholder="password"
                                />
                            </div>
                        </div>
                    </div>
                )}

                {/* IP Settings */}
                {wanType === 'ip' && (
                    <div className="space-y-3 bg-slate-950/50 p-4 rounded-xl border border-slate-800">
                        <div className="flex gap-4 mb-2">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="radio"
                                    name="addressingType"
                                    checked={addressingType === 'DHCP'}
                                    onChange={() => setAddressingType('DHCP')}
                                    className="text-primary focus:ring-primary bg-slate-900 border-slate-700"
                                />
                                <span className="text-sm text-slate-200">DHCP (Auto)</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="radio"
                                    name="addressingType"
                                    checked={addressingType === 'Static'}
                                    onChange={() => setAddressingType('Static')}
                                    className="text-primary focus:ring-primary bg-slate-900 border-slate-700"
                                />
                                <span className="text-sm text-slate-200">Static IP</span>
                            </label>
                        </div>

                        {addressingType === 'Static' && (
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1">
                                    <label className="text-xs text-slate-400">IP Address</label>
                                    <input
                                        type="text"
                                        value={ipAddress}
                                        onChange={(e) => setIpAddress(e.target.value)}
                                        className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:ring-1 focus:ring-primary outline-none"
                                        placeholder="192.168.1.10"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs text-slate-400">Subnet Mask</label>
                                    <input
                                        type="text"
                                        value={subnetMask}
                                        onChange={(e) => setSubnetMask(e.target.value)}
                                        className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:ring-1 focus:ring-primary outline-none"
                                        placeholder="255.255.255.0"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs text-slate-400">Gateway</label>
                                    <input
                                        type="text"
                                        value={defaultGateway}
                                        onChange={(e) => setDefaultGateway(e.target.value)}
                                        className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:ring-1 focus:ring-primary outline-none"
                                        placeholder="192.168.1.1"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs text-slate-400">DNS Servers</label>
                                    <input
                                        type="text"
                                        value={dnsServers}
                                        onChange={(e) => setDnsServers(e.target.value)}
                                        className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:ring-1 focus:ring-primary outline-none"
                                        placeholder="8.8.8.8, 1.1.1.1"
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* VLAN Settings */}
                <div className="bg-slate-950/50 p-4 rounded-xl border border-slate-800">
                    <div className="flex items-center gap-2 mb-2">
                        <input
                            type="checkbox"
                            id="hasVlan"
                            checked={hasVlan}
                            onChange={(e) => setHasVlan(e.target.checked)}
                            className="rounded bg-slate-900 border-slate-700 text-primary focus:ring-primary"
                        />
                        <label htmlFor="hasVlan" className="text-sm font-medium text-slate-300 cursor-pointer select-none">
                            Use VLAN (802.1q)
                        </label>
                    </div>

                    {hasVlan && (
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-400">VLAN ID</label>
                            <div className="relative">
                                <Server className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                                <input
                                    type="number"
                                    value={vlanId}
                                    onChange={(e) => setVlanId(e.target.value)}
                                    className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-10 pr-4 py-2 text-sm text-white focus:ring-1 focus:ring-primary outline-none"
                                    placeholder="100"
                                />
                            </div>
                        </div>
                    )}
                </div>

                {/* Port Binding */}
                <div className="bg-slate-950/50 p-4 rounded-xl border border-slate-800">
                    <label className="text-sm font-medium text-slate-300 mb-3 block">Port Binding</label>
                    <div className="flex flex-wrap gap-2">
                        {['LAN1', 'LAN2', 'LAN3', 'LAN4', 'SSID1'].map(port => (
                            <button
                                key={port}
                                type="button"
                                onClick={() => {
                                    setBindPorts(prev =>
                                        prev.includes(port) ? prev.filter(p => p !== port) : [...prev, port]
                                    );
                                }}
                                className={clsx(
                                    "px-3 py-1.5 rounded-lg text-xs font-bold border transition-all",
                                    bindPorts.includes(port)
                                        ? "bg-primary border-primary text-white shadow-lg shadow-primary/20"
                                        : "bg-slate-900 border-slate-800 text-slate-500 hover:border-slate-700 hover:text-slate-300"
                                )}
                            >
                                {port}
                            </button>
                        ))}
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
                        loading={updateWanMutation.isPending}
                        disabled={wanType === 'pppoe' && !username}
                    >
                        Apply Configuration
                    </Button>
                </div>
            </form>
        </Modal>
    );
}
