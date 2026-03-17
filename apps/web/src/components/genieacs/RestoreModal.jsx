import React, { useState, useEffect } from 'react';
import clsx from 'clsx';
import { Modal } from '../ui/Modal';
import { 
    useGenieACSBackups, 
    useRestoreGenieACSAuto, 
    useRestoreGenieACSManual,
    useGenieACSDevice,
    useDeleteGenieACSWanConfig,
    useDeleteGenieACSBackup
} from '../../hooks/useGenieACS';
import { toast } from 'react-hot-toast';
import { ChevronDown, ChevronUp, Globe, Network, Cpu, Wifi, Info, ShieldCheck, Trash2 } from 'lucide-react';

const RestoreModal = ({ isOpen, onClose, device, routerId }) => {
    const [activeTab, setActiveTab] = useState('auto');
    const [expandedBackupId, setExpandedBackupId] = useState(null);
    const [selectedIndices, setSelectedIndices] = useState({}); // { [backupId]: [indices] }
    const { data: backups = [], isLoading: loading } = useGenieACSBackups(device?._id, routerId);
    
    // Fetch full device for connection management
    const { data: fullDevice } = useGenieACSDevice(device?._id, routerId);
    
    const restoreAuto = useRestoreGenieACSAuto();
    const restoreManual = useRestoreGenieACSManual();
    const deleteWan = useDeleteGenieACSWanConfig();
    const deleteBackup = useDeleteGenieACSBackup();

    const [editingPath, setEditingPath] = useState(null);

    // Manual Form State
    const [manualConfig, setManualConfig] = useState({
        connectionType: 'PPPoE',
        vlanId: '',
        pppoeUser: '',
        pppoePass: '',
        bindPorts: [],
        dhcpServerEnable: true
    });

    useEffect(() => {
        if (isOpen && device?._pppoeUser) {
            setManualConfig(prev => ({
                ...prev,
                pppoeUser: device._pppoeUser || '',
                pppoePass: device._pppoePass || '',
                vlanId: device._vlanId || ''
            }));
        }
    }, [isOpen, device]);

    const handleAutoRestore = async (backupId) => {
        const indices = selectedIndices[backupId];
        if (indices && indices.length === 0) {
            toast.error('Silakan pilih setidaknya satu koneksi untuk di-restore');
            return;
        }

        if (!confirm('Are you sure you want to restore the selected configuration? The device may reboot.')) return;
        
        restoreAuto.mutate({ id: device._id, backupId, routerId, selectedWanIndices: indices }, {
            onSuccess: () => onClose()
        });
    };

    const toggleWanSelection = (backupId, index) => {
        setSelectedIndices(prev => {
            const current = prev[backupId] || [];
            if (current.includes(index)) {
                return { ...prev, [backupId]: current.filter(i => i !== index) };
            } else {
                return { ...prev, [backupId]: [...current, index] };
            }
        });
    };

    const handleDeleteBackup = async (e, backupId) => {
        e.stopPropagation();
        if (!confirm('Apakah Anda yakin ingin menghapus backup ini?')) return;
        deleteBackup.mutate({ id: device._id, backupId, routerId });
    };

    const handleManualRestore = async (e) => {
        e.preventDefault();
        const payload = {
            ...manualConfig,
            bindPorts: manualConfig.bindPorts.join(','),
            connectionPath: editingPath // Include if editing
        };
        
        restoreManual.mutate({ id: device._id, config: payload, routerId }, {
            onSuccess: () => {
                setEditingPath(null);
                onClose();
            }
        });
    };

    const togglePort = (port) => {
        setManualConfig(prev => ({
            ...prev,
            bindPorts: prev.bindPorts.includes(port)
                ? prev.bindPorts.filter(p => p !== port)
                : [...prev.bindPorts, port]
        }));
    };

    const handleDeleteWan = (path) => {
        if (!confirm(`Are you sure you want to delete this WAN connection? (${path})`)) return;
        deleteWan.mutate({ id: device._id, connectionPath: path, routerId });
    };

    const handleEditWan = (conn) => {
        setEditingPath(conn.path);
        setManualConfig(prev => ({
            ...prev,
            connectionType: conn.type,
            vlanId: conn.vlan !== '-' ? (conn.vlan || '') : '',
            pppoeUser: conn.user || '',
            pppoePass: conn.pass || '',
            bindPorts: conn.bindPorts || [],
        }));
        setActiveTab('manual');
        toast.success(`Editing connection: ${conn.name}`);
    };

    // Helper to normalize port names from ONT to UI (LAN1, SSID1)
    const normalizePorts = (paths = []) => {
        return paths.map(path => {
            if (typeof path !== 'string') return path;
            
            // Handle LANEthernetInterfaceConfig.x -> LANx
            if (path.includes('LANEthernetInterfaceConfig.')) {
                const num = path.split('LANEthernetInterfaceConfig.').pop();
                return `LAN${num}`;
            }
            // Handle WLANConfiguration.x -> SSIDx
            if (path.includes('WLANConfiguration.')) {
                const num = path.split('WLANConfiguration.').pop();
                return `SSID${num}`;
            }
            // Pass through if already normalized or fallback
            return path;
        });
    };

    const getWanConnections = (dev) => {
        if (!dev) return [];
        return dev._wanConnections || [];
    };

    if (!isOpen) return null;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Restore Configuration: ${device?._serialNumber}`} size="lg">
            <div className="flex border-b border-gray-700 mb-4">
                <button
                    className={`px-4 py-2 font-medium ${activeTab === 'auto' ? 'border-b-2 border-blue-500 text-blue-500' : 'text-gray-400'}`}
                    onClick={() => setActiveTab('auto')}
                >
                    Auto Restore
                </button>
                <button
                    className={`px-4 py-2 font-medium ${activeTab === 'manual' ? 'border-b-2 border-blue-500 text-blue-500' : 'text-gray-400'}`}
                    onClick={() => setActiveTab('manual')}
                >
                    Manual Restore
                </button>
            </div>

            {activeTab === 'auto' ? (
                <div className="space-y-4">
                    <div className="flex items-center gap-2 px-3 py-2 bg-blue-500/5 border border-blue-500/20 rounded-lg mb-2">
                        <Info className="w-3.5 h-3.5 text-blue-400" />
                        <p className="text-[10px] text-blue-300 font-medium">
                            Sistem otomatis hanya menampilkan backup yang cocok dengan model <span className="text-white font-bold">{device?._productClass || 'ZTE F609'}</span>.
                        </p>
                    </div>
                    {loading && <div className="text-center py-4">Loading backups...</div>}
                    {!loading && backups.length === 0 && (
                        <div className="text-center py-8 bg-gray-800/50 rounded-lg border border-dashed border-gray-700">
                            <p className="text-gray-500">No backups found for this model</p>
                        </div>
                    )}
                    <div className="grid gap-2 max-h-[350px] overflow-y-auto pr-1">
                        {backups.map(backup => {
                            const isExpanded = expandedBackupId === backup.id;
                            const config = backup.config || {};
                            const primaryWan = config.wan?.[0] || {};
                            
                            return (
                                <div key={backup.id} className="flex flex-col bg-gray-800 rounded-lg border border-gray-700 hover:border-blue-500/50 transition-all overflow-hidden">
                                    <div 
                                        className="flex items-center justify-between p-3 cursor-pointer"
                                        onClick={() => setExpandedBackupId(isExpanded ? null : backup.id)}
                                    >
                                        <div className="flex-1 min-w-0 mr-4">
                                            <div className="font-medium truncate flex items-center gap-2">
                                                {backup.name}
                                                {isExpanded ? <ChevronUp className="w-3 h-3 text-slate-500" /> : <ChevronDown className="w-3 h-3 text-slate-500" />}
                                            </div>
                                            <div className="text-[10px] text-gray-400 flex items-center gap-2">
                                                <span>{new Date(backup.createdAt).toLocaleString()}</span>
                                                <span className="bg-gray-700 px-1 rounded text-[9px] uppercase">{backup.model}</span>
                                                {backup.sn !== device?._serialNumber && (
                                                    <span className="text-blue-400 font-bold border border-blue-500/30 px-1 rounded bg-blue-500/5 text-[8px]">TEMPLATE</span>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={(e) => handleDeleteBackup(e, backup.id)}
                                                className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all"
                                                title="Hapus Backup"
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleAutoRestore(backup.id);
                                                }}
                                                className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm transition-colors whitespace-nowrap font-bold shadow-lg shadow-blue-900/20"
                                            >
                                                Restore
                                            </button>
                                        </div>
                                    </div>

                                    {isExpanded && (
                                        <div className="px-3 pb-3 pt-1 border-t border-gray-700/50 bg-gray-900/30 space-y-3">
                                            {(config.wan || []).map((wan, idx) => {
                                                const isSelected = (selectedIndices[backup.id] || []).includes(idx);
                                                
                                                // Initialize selection if not set
                                                if (selectedIndices[backup.id] === undefined) {
                                                    setSelectedIndices(prev => ({ ...prev, [backup.id]: (config.wan || []).map((_, i) => i) }));
                                                }

                                                return (
                                                    <div 
                                                        key={idx} 
                                                        className={clsx(
                                                            "border-b border-gray-800 pb-2 last:border-0 last:pb-0 cursor-pointer transition-opacity",
                                                            !isSelected && "opacity-40"
                                                        )}
                                                        onClick={() => toggleWanSelection(backup.id, idx)}
                                                    >
                                                        <div className="text-[8px] font-black text-slate-600 mb-1 uppercase tracking-widest flex items-center justify-between">
                                                            <div className="flex items-center gap-1">
                                                                <div className={clsx("w-1 h-1 rounded-full", isSelected ? "bg-blue-500" : "bg-slate-700")}></div>
                                                                Connection {idx + 1}: {wan.name || 'MANUAL'}
                                                            </div>
                                                            <div className={clsx(
                                                                "w-3 h-3 rounded flex items-center justify-center border",
                                                                isSelected ? "bg-blue-600 border-blue-500" : "border-slate-700"
                                                            )}>
                                                                {isSelected && <div className="w-1.5 h-1.5 bg-white rounded-full"></div>}
                                                            </div>
                                                        </div>
                                                        <div className="grid grid-cols-2 gap-y-1.5 gap-x-4 text-[9px]">
                                                            <div className="flex items-center gap-1.5 text-slate-400">
                                                                <Globe className="w-2.5 h-2.5 text-blue-400" />
                                                                <span className="font-semibold text-slate-300">MODE:</span>
                                                                <span className="uppercase text-blue-400 font-bold">{wan.mode || 'ROUTE'}</span>
                                                            </div>
                                                            <div className="flex items-center gap-1.5 text-slate-400">
                                                                <Network className="w-2.5 h-2.5 text-emerald-400" />
                                                                <span className="font-semibold text-slate-300">VLAN:</span>
                                                                <span className="text-emerald-400 font-bold">{wan.vlanId || 'UNTAGGED'}</span>
                                                            </div>
                                                            <div className="flex items-start gap-1.5 text-slate-400 col-span-2">
                                                                <Cpu className="w-2.5 h-2.5 text-purple-400 mt-0.5" />
                                                                <span className="font-semibold text-slate-300 whitespace-nowrap">BIND PORTS:</span>
                                                                <div className="flex flex-wrap gap-1">
                                                                    {(wan.bindPorts || []).map(p => (
                                                                        <span key={p} className="bg-slate-800 px-1 rounded border border-slate-700 text-[8px] text-purple-300 font-black">{p}</span>
                                                                    ))}
                                                                    {(!wan.bindPorts || wan.bindPorts.length === 0) && <span className="text-slate-600 italic">None</span>}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                            
                                            {config.wifi?.ssid && (
                                                <div className="flex items-center gap-1.5 text-slate-400 border-t border-gray-800 pt-2">
                                                    <Wifi className="w-3 h-3 text-amber-400" />
                                                    <span className="font-[9px] font-semibold text-slate-300 uppercase tracking-tighter">WIFI SSID:</span>
                                                    <span className="text-[9px] text-amber-400 font-mono italic font-bold">{config.wifi.ssid}</span>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            ) : (
                <form onSubmit={handleManualRestore} className="space-y-4">
                    {editingPath && (
                        <div className="flex items-center justify-between p-3 bg-blue-900/30 border border-blue-500/50 rounded-lg text-blue-300">
                            <div className="flex items-center gap-2">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                                <span className="text-xs font-semibold uppercase">Mode Edit: {editingPath.split('.').reverse()[0]}</span>
                            </div>
                            <button 
                                type="button" 
                                onClick={() => {
                                    setEditingPath(null);
                                    setManualConfig({
                                        connectionType: 'PPPoE',
                                        vlanId: '',
                                        pppoeUser: '',
                                        pppoePass: '',
                                        bindPorts: [],
                                        dhcpServerEnable: true
                                    });
                                }}
                                className="text-xs font-bold hover:underline"
                            >
                                Batal Edit
                            </button>
                        </div>
                    )}
                    {/* ... (rest of the form remains similar but using the new path logic) ... */}

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-1">Connection Type</label>
                            <select
                                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                value={manualConfig.connectionType}
                                onChange={e => setManualConfig({ ...manualConfig, connectionType: e.target.value })}
                            >
                                <option value="PPPoE">PPPoE</option>
                                <option value="Bridge">Bridge</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-1">VLAN ID</label>
                            <input
                                type="number"
                                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                placeholder="e.g. 100"
                                value={manualConfig.vlanId}
                                onChange={e => setManualConfig({ ...manualConfig, vlanId: e.target.value })}
                            />
                        </div>
                    </div>

                    <div className="flex items-center gap-2 p-3 bg-gray-800/50 rounded-lg border border-gray-700">
                        <input
                            type="checkbox"
                            id="dhcpServerEnable"
                            className="w-4 h-4 rounded border-gray-700 bg-gray-900 text-blue-600 focus:ring-blue-500 cursor-pointer"
                            checked={manualConfig.dhcpServerEnable}
                            onChange={e => setManualConfig({ ...manualConfig, dhcpServerEnable: e.target.checked })}
                        />
                        <label htmlFor="dhcpServerEnable" className="text-sm font-medium text-gray-300 cursor-pointer select-none">
                            Enable DHCP Server (LAN)
                            {manualConfig.connectionType === 'Bridge' && (
                                <span className="ml-2 text-[10px] text-yellow-500 italic">*Disarankan OFF untuk mode Bridge</span>
                            )}
                        </label>
                    </div>

                    {manualConfig.connectionType === 'PPPoE' && (
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-1">PPPoE User</label>
                                <input
                                    type="text"
                                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    value={manualConfig.pppoeUser}
                                    onChange={e => setManualConfig({ ...manualConfig, pppoeUser: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-1">PPPoE Password</label>
                                <input
                                    type="password"
                                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    value={manualConfig.pppoePass}
                                    onChange={e => setManualConfig({ ...manualConfig, pppoePass: e.target.value })}
                                />
                            </div>
                        </div>
                    )}
                    

                    <div>
                        <label className="block text-sm font-medium text-gray-400 mb-2">Port Binding</label>
                        <div className="space-y-4 bg-gray-800/50 p-4 rounded-lg border border-gray-700">
                            <div>
                                <p className="text-xs font-semibold text-gray-500 uppercase mb-2">LAN Ports</p>
                                <div className="flex gap-2">
                                    {['LAN1', 'LAN2', 'LAN3', 'LAN4'].map(port => (
                                        <button
                                            key={port}
                                            type="button"
                                            onClick={() => togglePort(port)}
                                            className={`px-3 py-1 rounded border ${manualConfig.bindPorts.includes(port) ? 'bg-blue-600 border-blue-500' : 'bg-gray-800 border-gray-700 text-gray-400'}`}
                                        >
                                            {port}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Wireless (2.4GHz & 5GHz)</p>
                                <div className="flex flex-wrap gap-2">
                                    {['SSID1', 'SSID2', 'SSID3', 'SSID4', 'SSID5', 'SSID6', 'SSID7', 'SSID8'].map(ssid => (
                                        <button
                                            key={ssid}
                                            type="button"
                                            onClick={() => togglePort(ssid)}
                                            className={`px-3 py-1 rounded border ${manualConfig.bindPorts.includes(ssid) ? 'bg-blue-600 border-blue-500' : 'bg-gray-800 border-gray-700 text-gray-400'}`}
                                        >
                                            {ssid}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="mt-6 border-t border-gray-700 pt-6">
                        <p className="text-xs font-semibold text-gray-500 uppercase mb-4">Current Connections (ONT)</p>
                        <div className="bg-gray-800/30 rounded-lg border border-gray-700 divide-y divide-gray-700 overflow-hidden">
                            {fullDevice && getWanConnections(fullDevice).length === 0 ? (
                                <div className="p-4 text-sm text-gray-500 italic text-center">No connections detected or still loading...</div>
                            ) : (
                                fullDevice && getWanConnections(fullDevice).map((conn, idx) => {
                                    // Use backend flag for management protection
                                    const isMgmt = conn.isManagement;

                                    return (
                                        <div key={idx} className="p-3 flex items-center gap-4 hover:bg-gray-800/50 transition-colors">
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-0.5">
                                                    <span className="text-sm font-semibold text-gray-100 truncate">{conn.name}</span>
                                                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase ${conn.type === 'PPPoE' ? 'bg-blue-900/40 text-blue-400' : 'bg-green-900/40 text-green-400'}`}>
                                                        {conn.type}
                                                    </span>
                                                    {conn.vlan !== '-' && (
                                                        <span className="text-[9px] font-bold bg-gray-700 text-gray-300 px-1.5 py-0.5 rounded">
                                                            VLAN {conn.vlan}
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="text-[10px] text-gray-500 font-mono truncate" title={conn.path}>
                                                    {conn.path}
                                                </div>
                                            </div>
                                            
                                            <div className="flex items-center gap-2">
                                                {!isMgmt ? (
                                                    <>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleEditWan(conn)}
                                                            className="p-2 bg-blue-900/20 hover:bg-blue-900/40 text-blue-500 hover:text-blue-400 border border-blue-900/30 rounded-lg transition-all"
                                                            title="Edit this connection"
                                                        >
                                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                                            </svg>
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleDeleteWan(conn.path)}
                                                            disabled={deleteWan.isPending}
                                                            className="p-2 bg-red-900/20 hover:bg-red-900/40 text-red-500 hover:text-red-400 border border-red-900/30 rounded-lg transition-all"
                                                            title="Delete this connection"
                                                        >
                                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                            </svg>
                                                        </button>
                                                    </>
                                                ) : (
                                                    <div className="flex items-center gap-1.5 px-2 py-1 bg-gray-800/50 rounded-md border border-gray-700">
                                                        <svg className="w-3 h-3 text-gray-500" fill="currentColor" viewBox="0 0 20 20">
                                                            <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                                                        </svg>
                                                        <span className="text-[10px] text-gray-500 font-medium uppercase tracking-tight">System</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                        <p className="text-[10px] text-gray-500 mt-1 italic px-1">
                            *Index 1 (Management) dilindungi dan tidak bisa dihapus demi keamanan koneksi ACS.
                        </p>
                    </div>

                    <div className="flex justify-end gap-3 pt-5 border-t border-gray-700">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={loading || restoreAuto.isPending || restoreManual.isPending || !manualConfig.vlanId}
                            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {(restoreAuto.isPending || restoreManual.isPending) ? 'Restoring...' : 'Push Configuration'}
                        </button>
                    </div>
                </form>
            )}
        </Modal>
    );
};

export default RestoreModal;
