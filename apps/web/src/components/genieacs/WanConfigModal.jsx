import React, { useState, useEffect } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { 
    useUpdateGenieACSWanConfig, 
    useCreatePreset, 
    useGenieACSDevice,
    useDeleteGenieACSWanConfig
} from '@/hooks';
import { Globe, Server, Key, User, Activity, Network, Trash2, Edit2, AlertTriangle, ShieldCheck, Loader2, Save } from 'lucide-react';
import { toast } from 'react-hot-toast';
import clsx from 'clsx';

export default function WanConfigModal({ isOpen, onClose, device, routerId }) {
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
    const [remoteAccessEnable, setRemoteAccessEnable] = useState(false);
    const [serviceList, setServiceList] = useState('INTERNET');

    // Port Binding
    const [bindPorts, setBindPorts] = useState([]); // ['LAN1', 'LAN2', 'LAN3', 'LAN4', 'SSID1']
    const [availablePorts, setAvailablePorts] = useState(['LAN1', 'LAN2', 'LAN3', 'LAN4']);
    const [dhcpServerEnable, setDhcpServerEnable] = useState(true);
    const [editingPath, setEditingPath] = useState(null);
    const [isAcsLoading, setIsAcsLoading] = useState(false);

    // Fetch full device for connection management
    const { data: fullDevice } = useGenieACSDevice(device?._id, routerId);
    
    const updateWanMutation = useUpdateGenieACSWanConfig();
    const createPresetMutation = useCreatePreset();
    const deleteWanMutation = useDeleteGenieACSWanConfig();

    useEffect(() => {
        if (isOpen && device) {
            setWanType('pppoe');
            setConnectionMode('route');
            setUsername('');
            setPassword('');
            setVlanId('');
            setHasVlan(false);
            setBindPorts([]);
            setDhcpServerEnable(true);
            setEditingPath(null);
            setServiceList('INTERNET');

            // Derive current Remote Access state from the device parameter
            // tree. Path differs per vendor — pick the most authoritative
            // for each. GenieACS exposes parameter values under `_value`.
            const igd = device.InternetGatewayDevice;
            const tr181 = device.Device;
            const mfg = (device._deviceId?._Manufacturer || device._manufacturer || '').toUpperCase();
            const isHw = mfg.includes('HUAWEI');
            const isFh = mfg.includes('FIBERHOME') || mfg.includes('FHTT') || mfg.includes('FH');
            const isZte = mfg.includes('ZTE');
            let currentRemote = false;
            try {
                if (isHw && igd?.X_HW_Security?.AclServices) {
                    currentRemote = !!igd.X_HW_Security.AclServices.HTTPWanEnable?._value;
                } else if (isFh && igd?.X_FH_FireWall) {
                    currentRemote = !!igd.X_FH_FireWall.REMOTEACCEnable?._value;
                } else if (isZte) {
                    currentRemote = !!(tr181?.UserInterface?.RemoteAccess?.Enable?._value
                        || igd?.UserInterface?.RemoteAccess?.Enable?._value);
                } else {
                    currentRemote = !!(tr181?.UserInterface?.RemoteAccess?.Enable?._value
                        || igd?.UserInterface?.RemoteAccess?.Enable?._value);
                }
            } catch { currentRemote = false; }
            setRemoteAccessEnable(currentRemote);

            // Discover SSIDs from device data
            const lanDevice = device.InternetGatewayDevice?.LANDevice?.[1] || device.Device?.LANDevice?.[1];
            if (lanDevice && lanDevice.WLANConfiguration) {
                const ssids = Object.keys(lanDevice.WLANConfiguration)
                    .filter(key => !key.startsWith('_'))
                    .map(key => `SSID${key}`);
                setAvailablePorts(['LAN1', 'LAN2', 'LAN3', 'LAN4', ...ssids]);
            } else {
                setAvailablePorts(['LAN1', 'LAN2', 'LAN3', 'LAN4', 'SSID1', 'SSID5']);
            }
        }
    }, [isOpen, device]);

    const getFormConfig = () => {
        const config = {
            wanType,
            connectionMode,
            connectionIndex: 1, // Default to 1 for now
            enable: true,
            remoteAccessEnable,
            dhcpServerEnable,
            serviceList
        };

        if (editingPath) {
            config.connectionPath = editingPath;
        }

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
            routerId: routerId
        }, {
            onSuccess: () => {
                setEditingPath(null);
                onClose();
            }
        });
    };

    const handleDeleteWan = (path) => {
        if (!confirm(`Are you sure you want to delete this WAN connection? (${path})`)) return;
        deleteWanMutation.mutate({ 
            id: device._id, 
            connectionPath: path, 
            routerId: routerId 
        });
    };

    const handleEditWan = (conn) => {
        setEditingPath(conn.path);
        setWanType(conn.type === 'PPPoE' ? 'pppoe' : 'ip');
        setConnectionMode(conn.mode === 'Bridge' ? 'bridge' : 'route');
        
        // Comprehensive property mapping
        const vid = conn.vlanId || conn.vlan;
        const vEnable = conn.vlanEnable || conn.vlanId > 0;
        
        setVlanId(vid && vid !== '-' ? vid.toString() : '');
        setHasVlan(!!vEnable);
        
        setUsername(conn.username || conn.user || '');
        setPassword(conn.password || conn.pass || '');
        setServiceList(conn.serviceList || 'INTERNET');
        
        // Smart DHCP detection
        const dhcp = conn.dhcpServerEnable ?? (conn.mode !== 'Bridge');
        setDhcpServerEnable(dhcp);
        
        // Normalize ports for UI highlighting
        if (conn.bindPorts) {
            setBindPorts(normalizePorts(conn.bindPorts));
        } else {
            setBindPorts([]);
        }
        
        toast.success(`Editing connection: ${conn.name}`);
    };

    // Helper to normalize port names from ONT to UI (LAN1, SSID1)
    const normalizePorts = (paths = []) => {
        if (!Array.isArray(paths)) return [];
        return paths.map(path => {
            if (typeof path !== 'string') return path;
            
            // Handle full TR-069 paths
            if (path.includes('LANEthernetInterfaceConfig.')) {
                return `LAN${path.split('LANEthernetInterfaceConfig.').pop()}`;
            }
            if (path.includes('WLANConfiguration.')) {
                return `SSID${path.split('WLANConfiguration.').pop()}`;
            }
            
            // Handle plain names or truncated names
            const upper = path.toUpperCase();
            if (upper.startsWith('LAN')) return `LAN${upper.replace('LAN', '').trim()}`;
            if (upper.startsWith('SSID')) return `SSID${upper.replace('SSID', '').trim()}`;
            
            return path;
        });
    };

    const getWanConnections = (dev) => {
        if (!dev) return [];
        // Use pre-calculated connections from backend if available
        if (dev._wanConnections) return dev._wanConnections;
        return [];
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
        <Modal isOpen={isOpen} onClose={onClose} title={`WAN Configuration (${device?._serialNumber || device?._id})`} maxWidth="max-w-4xl">
            <form onSubmit={handleSubmit} className="space-y-4 py-2">
                {editingPath && (
                    <div className="flex items-center justify-between p-3 bg-blue-900/30 border border-blue-500/50 rounded-lg text-blue-300 mb-2">
                        <div className="flex items-center gap-2">
                            <Edit2 className="w-4 h-4" />
                            <span className="text-xs font-semibold uppercase">Mode Edit: {editingPath.split('.').pop()}</span>
                        </div>
                        <button 
                            type="button" 
                            onClick={() => {
                                setEditingPath(null);
                                setWanType('pppoe');
                                setUsername('');
                                setPassword('');
                                setVlanId('');
                                setHasVlan(false);
                                setBindPorts([]);
                            }}
                            className="text-xs font-bold hover:underline"
                        >
                            Batal Edit
                        </button>
                    </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-400 mb-1">Connection Type</label>
                        <select
                            value={connectionMode === 'bridge' ? `${wanType}_bridge` : wanType}
                            onChange={(e) => {
                                const val = e.target.value;
                                if (val.endsWith('_bridge')) {
                                    setConnectionMode('bridge');
                                    setWanType(val.replace('_bridge', ''));
                                } else {
                                    setConnectionMode('route');
                                    setWanType(val);
                                }
                            }}
                            className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                        >
                            <option value="pppoe" className="bg-slate-900 text-white">PPPoE (Route)</option>
                            <option value="ip" className="bg-slate-900 text-white">IP (Route)</option>
                            <option value="pppoe_bridge" className="bg-slate-900 text-white">PPPoE Bridge</option>
                            <option value="ip_bridge" className="bg-slate-900 text-white">IP Bridge</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-400 mb-1">VLAN ID</label>
                        <input
                            type="number"
                            value={vlanId}
                            onChange={(e) => {
                                setVlanId(e.target.value);
                                setHasVlan(!!e.target.value);
                            }}
                            className="w-full bg-slate-910 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:ring-1 focus:ring-primary outline-none"
                            placeholder="e.g. 100"
                        />
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-400 mb-1">Service List</label>
                        <select
                            value={serviceList}
                            onChange={(e) => setServiceList(e.target.value)}
                            className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-white focus:ring-2 focus:ring-blue-500 outline-none"
                        >
                            <option value="INTERNET">INTERNET</option>
                            <option value="OTHER">OTHER</option>
                            <option value="TR069,VOIP">TR069,VOIP</option>
                            <option value="INTERNET,VOIP">INTERNET,VOIP</option>
                            <option value="VOIP">VOIP</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-400 mb-1">Custom Service List</label>
                        <input
                            type="text"
                            value={serviceList}
                            onChange={(e) => setServiceList(e.target.value)}
                            className="w-full bg-slate-910 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:ring-1 focus:ring-primary outline-none"
                            placeholder="Alt e.g. TR069,VOIP,INTERNET"
                        />
                    </div>
                </div>

                <div className="flex items-center gap-2 p-3 bg-slate-950/50 rounded-lg border border-slate-800">
                    <input
                        type="checkbox"
                        id="dhcpServerEnable"
                        checked={dhcpServerEnable}
                        onChange={(e) => setDhcpServerEnable(e.target.checked)}
                        className="rounded bg-slate-900 border-slate-700 text-primary focus:ring-primary"
                    />
                    <label htmlFor="dhcpServerEnable" className="text-sm font-medium text-slate-300 cursor-pointer select-none">
                        Enable DHCP Server (LAN)
                        {connectionMode === 'bridge' && (
                            <span className="ml-2 text-[10px] text-yellow-500 italic">*Disarankan OFF untuk mode Bridge</span>
                        )}
                    </label>
                </div>

                {/* PPPoE Settings */}
                {wanType === 'pppoe' && connectionMode === 'route' && (
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                            <label className="block text-sm font-medium text-slate-400 mb-1">PPPoE User</label>
                            <input
                                type="text"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                className="w-full bg-slate-910 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:ring-1 focus:ring-primary outline-none"
                                placeholder="Username"
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="block text-sm font-medium text-slate-400 mb-1">PPPoE Password</label>
                            <input
                                type="text"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full bg-slate-910 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:ring-1 focus:ring-primary outline-none"
                                placeholder="Password"
                            />
                        </div>
                    </div>
                )}

                {/* IP Settings */}
                {wanType === 'ip' && connectionMode === 'route' && (
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
                {/* VLAN Section - Combined above, removing redundant block */}

                {/* Remote Access — vendor-specific parameter path. Driver
                    will pick the right path for the detected manufacturer.
                    Detect when target firmware doesn't expose the parameter
                    at all (e.g. ZTE F609) and disable toggle + show note. */}
                {(() => {
                    const mfg = (device?._deviceId?._Manufacturer || device?._manufacturer || '').toUpperCase();
                    const productClass = (device?._deviceId?._ProductClass || device?._productClass || '').toUpperCase();
                    const isFh = mfg.includes('FIBERHOME') || mfg.includes('FHTT') || mfg.includes('FH');
                    const isZte = mfg.includes('ZTE');
                    const isHw = mfg.includes('HUAWEI');
                    const vendorLabel = isFh ? 'FiberHome' : isZte ? 'ZTE' : isHw ? 'Huawei' : (mfg || 'Unknown');

                    // Probe device tree for parameter presence. If none of
                    // the known paths exist for this vendor, the firmware
                    // doesn't expose Remote Access via TR-069 and toggle
                    // would be a no-op (e.g. ZTE F609).
                    const igd = device?.InternetGatewayDevice;
                    const tr181 = device?.Device;
                    let hasParam = false;
                    if (isFh) {
                        hasParam = !!igd?.X_FH_FireWall?.REMOTEACCEnable;
                    } else if (isHw) {
                        hasParam = !!igd?.X_HW_Security?.AclServices?.HTTPWanEnable
                            || !!igd?.X_HW_RemoteAccess?.Enable
                            || !!tr181?.UserInterface?.RemoteAccess?.Enable;
                    } else if (isZte) {
                        // ZTE F609 famously doesn't have either of these
                        hasParam = !!igd?.UserInterface?.RemoteAccess?.Enable
                            || !!igd?.['X_ZTE-COM_FireWall']?.WANRemoteAccess
                            || !!tr181?.UserInterface?.RemoteAccess?.Enable;
                    } else {
                        hasParam = !!tr181?.UserInterface?.RemoteAccess?.Enable
                            || !!igd?.UserInterface?.RemoteAccess?.Enable;
                    }
                    const knownVendor = isFh || isZte || isHw;
                    const paramHint = isFh
                        ? 'X_FH_FireWall.REMOTEACCEnable'
                        : isZte
                            ? '(not supported on this firmware)'
                            : isHw
                                ? 'X_HW_Security.AclServices.HTTPWanEnable (+ SSH/TELNET)'
                                : 'standard TR-181/TR-098 path';

                    return (
                        <div className={clsx(
                            "p-4 rounded-xl border",
                            !hasParam ? "bg-slate-900/30 border-slate-800/60 opacity-70" : "bg-slate-950/50 border-slate-800"
                        )}>
                            <div className="flex items-center gap-2">
                                <input
                                    type="checkbox"
                                    id="remoteAccessEnable"
                                    checked={remoteAccessEnable}
                                    onChange={(e) => setRemoteAccessEnable(e.target.checked)}
                                    disabled={!hasParam}
                                    className="rounded bg-slate-900 border-slate-700 text-primary focus:ring-primary disabled:cursor-not-allowed"
                                />
                                <label htmlFor="remoteAccessEnable" className={clsx(
                                    "text-sm font-medium select-none",
                                    !hasParam ? "text-slate-500 cursor-not-allowed" : "text-slate-300 cursor-pointer"
                                )}>
                                    Enable Remote Access ({vendorLabel}{productClass ? ` ${productClass}` : ''})
                                </label>
                            </div>
                            <p className="text-[10px] text-slate-500 mt-1 italic">
                                *Parameter: {paramHint}
                            </p>
                            {!hasParam && knownVendor && (
                                <p className="text-[10px] text-amber-300 mt-1.5 leading-relaxed">
                                    ⚠️ Firmware {vendorLabel} {productClass || ''} ini tidak expose parameter Remote Access via TR-069.
                                    Toggle dinonaktifkan. Konfigurasi WAN HTTP access hanya bisa via web GUI device langsung
                                    (login dari LAN customer).
                                </p>
                            )}
                            {!knownVendor && (
                                <p className="text-[10px] text-amber-300 mt-1">
                                    ⚠️ Vendor "{vendorLabel}" tidak dikenali — toggle mungkin no-op. Verify di device web GUI.
                                </p>
                            )}
                            {hasParam && isHw && (
                                <p className="text-[10px] text-cyan-400 mt-1">
                                    ℹ️ Aktifkan: master switch HTTP/SSH/TELNET WanEnable + ACL WanAccess entry (Protocol HTTP, WanName ANY, Source 0.0.0.0/0).
                                </p>
                            )}
                        </div>
                    );
                })()}

                {/* Port Binding */}
                <div className="bg-slate-950/50 p-4 rounded-xl border border-slate-800">
                    <label className="text-sm font-medium text-slate-300 mb-3 block">Port Binding</label>
                    <div className="space-y-4">
                        <div>
                            <p className="text-[10px] font-semibold text-slate-500 uppercase mb-2">LAN Ports</p>
                            <div className="flex flex-wrap gap-2">
                                {availablePorts.filter(p => p.startsWith('LAN')).map(port => (
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
                                                ? "bg-primary border-primary text-white"
                                                : "bg-slate-900 border-slate-800 text-slate-500"
                                        )}
                                    >
                                        {port}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div>
                            <p className="text-[10px] font-semibold text-slate-500 uppercase mb-2">Wireless (2.4GHz & 5GHz)</p>
                            <div className="flex flex-wrap gap-2">
                                {availablePorts.filter(p => p.startsWith('SSID')).map(port => (
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
                                                ? "bg-primary border-primary text-white"
                                                : "bg-slate-900 border-slate-800 text-slate-500"
                                        )}
                                    >
                                        {port}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Current Connections Table */}
                <div className="pt-2 border-t border-slate-800">
                    <p className="text-xs font-semibold text-slate-500 uppercase mb-3">Active WAN Connections (ONT)</p>
                    <div className="bg-slate-950/30 rounded-xl border border-slate-800 overflow-hidden">
                        {!fullDevice ? (
                            <div className="p-8 text-sm text-slate-500 italic text-center">
                                <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 opacity-20" />
                                Synchronizing with CPE...
                            </div>
                        ) : getWanConnections(fullDevice).length === 0 ? (
                            <div className="p-8 text-sm text-slate-500 italic text-center uppercase tracking-widest">No active connections detected.</div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse min-w-[800px]">
                                    <thead className="bg-slate-900/50 text-slate-500 text-[9px] uppercase font-black tracking-widest border-b border-slate-800">
                                        <tr>
                                            <th className="px-3 py-3 w-10 text-center">En</th>
                                            <th className="px-3 py-3">Connection Name</th>
                                            <th className="px-3 py-3 w-20">Mode</th>
                                            <th className="px-3 py-3 w-24">Service</th>
                                            <th className="px-3 py-3">IP Address</th>
                                            <th className="px-3 py-3">User / Pass</th>
                                            <th className="px-3 py-3 w-12 text-center">NAT</th>
                                            <th className="px-3 py-3 w-20">VLAN ID</th>
                                            <th className="px-3 py-3">LAN BIND</th>
                                            <th className="px-3 py-3 text-right">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-800/50">
                                        {getWanConnections(fullDevice).map((conn, idx) => {
                                            const isMgmt = conn.isManagement;
                                            
                                            const isEditing = editingPath === conn.path;

                                            return (
                                                <tr 
                                                    key={idx} 
                                                    className={clsx(
                                                        "text-[11px] group transition-colors",
                                                        isEditing ? "bg-blue-500/10" : "hover:bg-slate-900/40"
                                                    )}
                                                >
                                                    <td className="px-3 py-3 text-center">
                                                        <div className={clsx(
                                                            "w-2 h-2 rounded-full mx-auto",
                                                            conn.status === 'Connected' ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]" : "bg-red-500/50"
                                                        )} />
                                                    </td>
                                                    <td className="px-3 py-3">
                                                        <div className="font-bold text-slate-200 truncate max-w-[120px]" title={conn.name}>{conn.name}</div>
                                                        <div className="text-[9px] text-slate-600 font-mono truncate max-w-[120px]">{conn.path.split('.').slice(-2).join('.')}</div>
                                                    </td>
                                                    <td className="px-3 py-3">
                                                        <span className={clsx(
                                                            "px-1.5 py-0.5 rounded-[3px] font-black text-[9px] uppercase",
                                                            conn.mode === 'Bridge' ? "bg-amber-500/10 text-amber-500 border border-amber-500/20" : "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                                                        )}>
                                                            {conn.mode}
                                                        </span>
                                                    </td>
                                                    <td className="px-3 py-3">
                                                        <div className="text-slate-400 font-medium truncate" title={conn.serviceList}>{conn.serviceList || '-'}</div>
                                                    </td>
                                                    <td className="px-3 py-3">
                                                        <div className="font-mono text-primary font-bold">{conn.externalIp || '0.0.0.0'}</div>
                                                    </td>
                                                    <td className="px-3 py-3">
                                                        {conn.type === 'PPPoE' ? (
                                                            <div className="flex flex-col gap-0.5">
                                                                <div className="text-slate-300 font-medium flex items-center gap-1">
                                                                    <User className="w-2.5 h-2.5 text-slate-500" />
                                                                    {conn.username || <span className="text-slate-700 italic">None</span>}
                                                                </div>
                                                                <div className="text-slate-500 font-mono text-[10px] flex items-center gap-1">
                                                                    <Key className="w-2.5 h-2.5 text-slate-600" />
                                                                    {conn.password ? '••••••••' : <span className="text-slate-800">None</span>}
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <span className="text-slate-600 font-black tracking-widest">---</span>
                                                        )}
                                                    </td>
                                                    <td className="px-3 py-3 text-center">
                                                        <span className={conn.nat ? "text-emerald-500 font-bold" : "text-slate-600"}>
                                                            {conn.nat ? 'ON' : 'OFF'}
                                                        </span>
                                                    </td>
                                                    <td className="px-3 py-3">
                                                        {conn.vlanEnable ? (
                                                            <div className="flex items-center gap-1.5">
                                                                <span className="text-blue-400 font-bold font-mono">{conn.vlanId || '-'}</span>
                                                                <span className="text-[8px] bg-blue-500/10 text-blue-500 px-1 rounded-sm border border-blue-500/20 font-black">V</span>
                                                            </div>
                                                        ) : (
                                                            <span className="text-slate-600">Off</span>
                                                        )}
                                                    </td>
                                                    <td className="px-3 py-3">
                                                        <div className="flex flex-wrap gap-1 max-w-[100px]">
                                                            {normalizePorts(conn.bindPorts || []).map(p => (
                                                                <span key={p} className="text-[8px] bg-slate-800 text-slate-400 px-1 py-0 border border-slate-700 rounded-sm font-bold">{p}</span>
                                                            ))}
                                                            {(!conn.bindPorts || conn.bindPorts.length === 0) && <span className="text-slate-700 italic">None</span>}
                                                        </div>
                                                    </td>
                                                    <td className="px-3 py-3 text-right">
                                                        <div className="flex justify-end gap-1">
                                                            {!isMgmt ? (
                                                                <>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handleEditWan(conn)}
                                                                        className={clsx(
                                                                            "p-1.5 rounded transition-all",
                                                                            isEditing ? "bg-primary text-white" : "hover:bg-slate-800 text-blue-400"
                                                                        )}
                                                                        title="Edit Connection"
                                                                    >
                                                                        <Edit2 className="w-3.5 h-3.5" />
                                                                    </button>
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handleDeleteWan(conn.path)}
                                                                        className={clsx(
                                                                            "p-1.5 rounded transition-all",
                                                                            deleteWanMutation.isPending && deleteWanMutation.variables?.connectionPath === conn.path 
                                                                                ? "bg-slate-800 text-slate-500 cursor-not-allowed" 
                                                                                : "hover:bg-slate-800 text-red-400"
                                                                        )}
                                                                        title="Delete Connection"
                                                                        disabled={deleteWanMutation.isPending}
                                                                    >
                                                                        {deleteWanMutation.isPending && deleteWanMutation.variables?.connectionPath === conn.path ? (
                                                                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                                        ) : (
                                                                            <Trash2 className="w-3.5 h-3.5" />
                                                                        )}
                                                                    </button>
                                                                </>
                                                            ) : (
                                                                <div className="flex items-center gap-1 px-1.5 py-0.5 bg-slate-900 rounded border border-slate-800">
                                                                    <ShieldCheck className="w-3 h-3 text-slate-500" />
                                                                    <span className="text-[8px] text-slate-500 font-black uppercase">System</span>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                    <p className="text-[9px] text-slate-600 mt-2 italic px-1">
                        *Index 1 (Management) dilindungi dan tidak dapat dihapus untuk menjaga konektivitas ACS.
                    </p>
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
                        disabled={wanType === 'pppoe' && connectionMode === 'route' && !username}
                    >
                        Apply Configuration
                    </Button>
                </div>
            </form>
        </Modal>
    );
}
