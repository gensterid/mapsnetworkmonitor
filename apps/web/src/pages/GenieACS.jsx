import React, { useState, useEffect } from 'react';
import PresetManagerModal from '@/components/genieacs/PresetManagerModal';
import {
    useGenieACSDevices,
    useRebootGenieACSDevice,
    useRefreshGenieACSDevice,
    useUpdateGenieACSParameter,
    useCurrentUser,
    useSettings,
    useRouters,
    useBulkPushConfigGenieAcs,
    useAppTimezone
} from '@/hooks';
import {
    Search,
    RefreshCw,
    Wifi,
    Monitor,
    Activity,
    Clock,
    Power,
    Server,
    Smartphone,
    Globe,
    Info,
    ChevronRight,
    ChevronDown,
    Zap,
    Cpu,
    Database,
    LayoutGrid,
    List
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { genieacsService } from '@/services/genieacs.service';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import WanConfigModal from '@/components/genieacs/WanConfigModal';
import WifiConfigModal from '@/components/genieacs/WifiConfigModal';
import clsx from 'clsx';
import { formatDateWithTimezone } from '@/lib/timezone';

function DeviceDetailModal({ isOpen, onClose, deviceId, routerId }) {
    const [search, setSearch] = useState('');
    const { data: fullDevice, isLoading } = useQuery({
        queryKey: ['genieacs-devices', deviceId, 'full', routerId],
        queryFn: () => genieacsService.getDevice(deviceId, routerId),
        enabled: !!deviceId && isOpen
    });

    const renderParamRow = (path, value, isObject = false) => {
        if (search && !path.toLowerCase().includes(search.toLowerCase()) && !String(value._value || '').toLowerCase().includes(search.toLowerCase())) {
            return null;
        }

        return (
            <div key={path} className="flex flex-col py-1.5 border-b border-slate-800/50 last:border-0 hover:bg-slate-800/30 px-2 rounded group">
                <div className="flex justify-between items-start gap-2">
                    <span className="text-[10px] font-mono text-slate-500 break-all">{path}</span>
                    <span className="text-[10px] font-mono text-primary bg-primary/5 px-1 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                        {value._type || (isObject ? 'Object' : 'String')}
                    </span>
                </div>
                <div className="text-sm text-slate-200 break-all mt-0.5">
                    {isObject ? (
                        <span className="text-slate-500 italic">Object</span>
                    ) : (
                        value._value === undefined || value._value === null ? 'null' : String(value._value)
                    )}
                </div>
            </div>
        );
    };

    const flattenTree = (obj, prefix = '') => {
        let items = [];
        for (const key in obj) {
            if (key.startsWith('_')) continue;

            const currentPath = prefix ? `${prefix}.${key}` : key;
            const value = obj[key];

            if (typeof value === 'object' && value !== null) {
                if ('_value' in value) {
                    items.push({ path: currentPath, data: value, isObject: false });
                } else {
                    items.push({ path: currentPath, data: value, isObject: true });
                    items = items.concat(flattenTree(value, currentPath));
                }
            }
        }
        return items;
    };

    const flattenedParams = fullDevice ? flattenTree(fullDevice) : [];

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={fullDevice ? `Device Details: ${fullDevice._id}` : 'Loading...'}
            size="xl"
        >
            <div className="flex flex-col h-[70vh]">
                {isLoading ? (
                    <div className="flex-1 flex flex-col items-center justify-center space-y-3">
                        <RefreshCw className="w-8 h-8 animate-spin text-primary" />
                        <p className="text-slate-400 animate-pulse">Fetching TR-069 Parameters...</p>
                    </div>
                ) : (
                    <>
                        {/* Detail Header / Stats */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                            <div className="bg-slate-900/50 p-3 rounded-xl border border-slate-800">
                                <div className="text-[10px] uppercase font-bold text-slate-500 mb-1">Manufacturer</div>
                                <div className="text-sm text-white font-medium">{fullDevice?._deviceId?._Manufacturer || 'N/A'}</div>
                            </div>
                            <div className="bg-slate-900/50 p-3 rounded-xl border border-slate-800">
                                <div className="text-[10px] uppercase font-bold text-slate-500 mb-1">Product Class</div>
                                <div className="text-sm text-white font-medium">{fullDevice?._deviceId?._ProductClass || 'N/A'}</div>
                            </div>
                            <div className="bg-slate-900/50 p-3 rounded-xl border border-slate-800">
                                <div className="text-[10px] uppercase font-bold text-slate-500 mb-1">Serial Number</div>
                                <div className="text-sm text-primary font-mono">{fullDevice?._deviceId?._SerialNumber || 'N/A'}</div>
                            </div>
                            <div className="bg-slate-900/50 p-3 rounded-xl border border-slate-800">
                                <div className="text-[10px] uppercase font-bold text-slate-500 mb-1">Software Version</div>
                                <div className="text-sm text-emerald-400 font-medium">
                                    {fullDevice?.InternetGatewayDevice?.DeviceInfo?.SoftwareVersion?._value ||
                                        fullDevice?.Device?.DeviceInfo?.SoftwareVersion?._value || 'N/A'}
                                </div>
                            </div>
                        </div>

                        {/* Search */}
                        <div className="relative mb-4">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                            <input
                                type="text"
                                placeholder="Filter parameters by name or value..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-10 pr-4 py-2.5 text-sm text-white focus:ring-1 focus:ring-primary outline-none"
                            />
                        </div>

                        {/* Tree View */}
                        <div className="flex-1 overflow-auto bg-slate-950/50 rounded-xl border border-slate-800 p-2 custom-scrollbar">
                            {flattenedParams.length === 0 ? (
                                <div className="h-full flex flex-col items-center justify-center text-slate-500 italic text-sm">
                                    No parameters matching filter
                                </div>
                            ) : (
                                <div className="space-y-1">
                                    {flattenedParams.map(item => renderParamRow(item.path, item.data, item.isObject))}
                                </div>
                            )}
                        </div>

                        <div className="mt-4 flex justify-end">
                            <Button variant="ghost" onClick={onClose}>Close</Button>
                        </div>
                    </>
                )}
            </div>
        </Modal>
    );
}

function RebootModal({ isOpen, onClose, device }) {
    const rebootMutation = useRebootGenieACSDevice();
    const refreshMutation = useRefreshGenieACSDevice();

    const handleReboot = () => {
        if (!device) return;
        rebootMutation.mutate({ id: device._id, routerId: device.routerId }, {
            onSuccess: () => onClose()
        });
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Reboot Device">
            <div className="space-y-4">
                <p className="text-slate-300">
                    Are you sure you want to reboot <strong className="text-white">{device?._id}</strong>?
                    This will temporarily interrupt service for the customer.
                </p>
                <div className="flex justify-end gap-2">
                    <Button variant="ghost" onClick={onClose}>Cancel</Button>
                    <Button variant="destructive" onClick={handleReboot} loading={rebootMutation.isPending}>
                        Reboot
                    </Button>
                </div>
            </div>
        </Modal>
    );
}

function WiFiConfigModal({ isOpen, onClose, device }) {
    const [ssid, setSsid] = useState('');
    const [password, setPassword] = useState('');
    const updateParamMutation = useUpdateGenieACSParameter();

    useEffect(() => {
        if (device && isOpen) {
            setSsid(device._ssid || '');
            setPassword(''); // Password usually not readable via TR-069 for security
        }
    }, [device, isOpen]);

    const handleSave = async () => {
        if (!device) return;

        try {
            // Determine TR-069 path based on device model (TR-098 vs TR-181)
            const isTr181 = !!device._isTr181;
            const ssidPath = isTr181
                ? 'Device.WiFi.SSID.1.SSID'
                : 'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.SSID';
            const passwordPath = isTr181
                ? 'Device.WiFi.AccessPoint.1.Security.KeyPassphrase'
                : 'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.PreSharedKey.1.KeyPassphrase';

            // Update SSID
            if (ssid !== device._ssid) {
                await updateParamMutation.mutateAsync({
                    id: device._id,
                    routerId: device.routerId,
                    parameterName: ssidPath,
                    value: ssid
                });
            }

            // Update Password
            if (password) {
                await updateParamMutation.mutateAsync({
                    id: device._id,
                    routerId: device.routerId,
                    parameterName: passwordPath,
                    value: password
                });
            }

            onClose();
        } catch (error) {
            // Error toast handled by hook
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="WiFi Configuration">
            <div className="space-y-4 py-2">
                <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-300">WiFi SSID (Nama WiFi)</label>
                    <div className="relative">
                        <Wifi className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                        <input
                            type="text"
                            value={ssid}
                            onChange={(e) => setSsid(e.target.value)}
                            className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-10 pr-4 py-2 text-sm text-white focus:ring-1 focus:ring-primary outline-none"
                            placeholder="My Home WiFi"
                        />
                    </div>
                </div>

                <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-300">WiFi Password (Kunci)</label>
                    <div className="relative">
                        <Zap className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-10 pr-4 py-2 text-sm text-white focus:ring-1 focus:ring-primary outline-none"
                            placeholder="••••••••"
                        />
                    </div>
                    <p className="text-[10px] text-slate-500">Kosongkan jika tidak ingin mengubah password.</p>
                </div>

                <div className="pt-4 flex justify-end gap-2">
                    <Button variant="ghost" onClick={onClose}>Batal</Button>
                    <Button
                        variant="primary"
                        onClick={handleSave}
                        loading={updateParamMutation.isPending}
                        disabled={!ssid}
                    >
                        Terapkan Perubahan
                    </Button>
                </div>
            </div>
        </Modal>
    );
}

export default function GenieACS() {
    const [searchQuery, setSearchQuery] = useState('');
    const [rebootDevice, setRebootDevice] = useState(null);
    const [wifiDevice, setWifiDevice] = useState(null);
    const [wanDevice, setWanDevice] = useState(null);
    const [detailDeviceId, setDetailDeviceId] = useState(null);
    const [selectedRouterId, setSelectedRouterId] = useState('');
    const [viewMode, setViewMode] = useState(() => {
        return localStorage.getItem('genieacs-view-mode') || 'grid';
    });

    const refreshMutation = useRefreshGenieACSDevice();

    const { data: routers = [] } = useRouters();
    const acsEnabledRouters = routers.filter(r => r.useGenieAcs);

    // Auto-select first router if none selected
    useEffect(() => {
        if (!selectedRouterId && acsEnabledRouters.length > 0) {
            setSelectedRouterId(acsEnabledRouters[0].id);
        }
    }, [acsEnabledRouters, selectedRouterId]);

    const { data: devices = [], isLoading, error, refetch, isFetching } = useGenieACSDevices(selectedRouterId, {
        refetchInterval: 60 * 1000 // Auto-refresh every 60 seconds
    });

    const { data: currentUser } = useCurrentUser();
    const { data: settings } = useSettings();
    const timezone = useAppTimezone();

    const filteredDevices = devices.filter(dev =>
        dev._id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        dev._ip?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        dev._serialNumber?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        dev._ssid?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const [selectedDeviceIds, setSelectedDeviceIds] = useState([]);
    const [showPresetManager, setShowPresetManager] = useState(false);

    // Bulk Hooks
    const bulkRebootMutation = useBulkRebootGenieAcs();
    const bulkPushConfigMutation = useBulkPushConfigGenieAcs();

    // Handlers
    const toggleSelectAll = () => {
        if (selectedDeviceIds.length === filteredDevices.length) {
            setSelectedDeviceIds([]);
        } else {
            setSelectedDeviceIds(filteredDevices.map(d => d._id));
        }
    };

    const toggleSelectDevice = (id) => {
        setSelectedDeviceIds(prev =>
            prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
        );
    };

    const handleBulkReboot = () => {
        if (!selectedDeviceIds.length) return;
        if (confirm(`Are you sure you want to reboot ${selectedDeviceIds.length} devices?`)) {
            bulkRebootMutation.mutate({ deviceIds: selectedDeviceIds, routerId: selectedRouterId }, {
                onSuccess: () => setSelectedDeviceIds([])
            });
        }
    };

    const handleApplyPreset = (preset) => {
        if (!selectedDeviceIds.length) return;
        if (confirm(`Apply preset "${preset.name}" to ${selectedDeviceIds.length} devices?`)) {
            bulkPushConfigMutation.mutate({
                deviceIds: selectedDeviceIds,
                type: preset.type,
                config: preset.config,
                routerId: selectedRouterId
            }, {
                onSuccess: () => {
                    setSelectedDeviceIds([]);
                    setShowPresetManager(false);
                }
            });
        }
    };

    if (isLoading) {
        return (
            <div className="flex-1 flex items-center justify-center bg-background-dark">
                <RefreshCw className="w-6 h-6 animate-spin text-primary" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center bg-background-dark p-8 text-center">
                <div className="text-red-400 mb-2">Error loading devices</div>
                <p className="text-slate-500 text-sm mb-4">{error.message}</p>
                <Button onClick={() => refetch()}>Try Again</Button>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-background-dark overflow-hidden">
            {/* Header */}
            <div className="p-6 border-b border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                        <Monitor className="w-8 h-8 text-primary" />
                        CPE Management
                    </h1>
                    <p className="text-slate-400 text-sm">Manage GenieACS devices (TR-069)</p>
                </div>

                <div className="flex flex-col sm:flex-row gap-3">
                    {/* Bulk Action Bar - Show when items selected */}
                    {selectedDeviceIds.length > 0 ? (
                        <div className="flex items-center gap-2 bg-slate-800 p-1.5 rounded-lg animate-in fade-in slide-in-from-top-2">
                            <span className="text-xs text-white px-2 font-medium">{selectedDeviceIds.length} Selected</span>
                            <Button size="sm" variant="destructive" onClick={handleBulkReboot} loading={bulkRebootMutation.isPending}>
                                <Power className="w-3 h-3 mr-1.5" /> Reboot
                            </Button>
                            <Button size="sm" variant="primary" onClick={() => setShowPresetManager(true)}>
                                <Database className="w-3 h-3 mr-1.5" /> Config
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setSelectedDeviceIds([])}>
                                Cancel
                            </Button>
                        </div>
                    ) : (
                        <>
                            {acsEnabledRouters.length > 0 && (
                                <div className="relative">
                                    <select
                                        value={selectedRouterId}
                                        onChange={(e) => setSelectedRouterId(e.target.value)}
                                        className="bg-slate-900 border border-slate-700 text-white text-sm rounded-lg pl-3 pr-8 py-2 focus:ring-1 focus:ring-primary focus:border-primary appearance-none cursor-pointer w-full sm:w-auto"
                                    >
                                        <option value="">Global ACS</option>
                                        {acsEnabledRouters.map(router => (
                                            <option key={router.id} value={router.id}>
                                                {router.name} ({router.host})
                                            </option>
                                        ))}
                                    </select>
                                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                                </div>
                            )}

                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                                <input
                                    type="text"
                                    placeholder="Search serial, IP, SSID..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="bg-slate-900 border border-slate-700 text-white text-sm rounded-lg pl-9 pr-3 py-2 focus:ring-1 focus:ring-primary focus:border-primary w-full sm:w-64"
                                />
                            </div>
                            <Button onClick={() => setShowPresetManager(true)} variant="secondary">
                                <Database className="w-4 h-4 mr-2" />
                                Presets
                            </Button>
                            <div className="flex bg-slate-900 border border-slate-700 rounded-lg p-1">
                                <button
                                    onClick={() => {
                                        setViewMode('grid');
                                        localStorage.setItem('genieacs-view-mode', 'grid');
                                    }}
                                    className={clsx(
                                        "p-1.5 rounded-md transition-colors",
                                        viewMode === 'grid' ? "bg-primary text-white" : "text-slate-400 hover:text-white"
                                    )}
                                    title="Grid View"
                                >
                                    <LayoutGrid className="w-4 h-4" />
                                </button>
                                <button
                                    onClick={() => {
                                        setViewMode('list');
                                        localStorage.setItem('genieacs-view-mode', 'list');
                                    }}
                                    className={clsx(
                                        "p-1.5 rounded-md transition-colors",
                                        viewMode === 'list' ? "bg-primary text-white" : "text-slate-400 hover:text-white"
                                    )}
                                    title="List View"
                                >
                                    <List className="w-4 h-4" />
                                </button>
                            </div>

                            <Button onClick={() => refetch()} variant="outline" className="relative">
                                <RefreshCw className={clsx("w-4 h-4 mr-2", isFetching && "animate-spin")} />
                                Refresh
                                {isFetching && !isLoading && (
                                    <span className="absolute -top-1 -right-1 flex h-2 w-2">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                                        <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
                                    </span>
                                )}
                            </Button>
                        </>
                    )}
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto p-6">
                <div className="flex items-center gap-2 mb-4">
                    <input
                        type="checkbox"
                        className="rounded border-slate-700 bg-slate-900 text-primary focus:ring-primary h-4 w-4 cursor-pointer"
                        checked={filteredDevices.length > 0 && selectedDeviceIds.length === filteredDevices.length}
                        onChange={toggleSelectAll}
                    />
                    <span className="text-sm text-slate-400">Select All {filteredDevices.length} Devices</span>
                </div>

                {filteredDevices.length > 0 ? (
                    viewMode === 'list' ? (
                        <div className="bg-slate-900/40 border border-slate-800 rounded-xl overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse">
                                    <thead className="bg-slate-800/50 text-slate-400 text-[10px] uppercase font-bold tracking-wider">
                                        <tr>
                                            <th className="px-4 py-3 w-8">
                                                <input
                                                    type="checkbox"
                                                    className="rounded border-slate-700 bg-slate-900 text-primary focus:ring-primary h-4 w-4 cursor-pointer"
                                                    checked={selectedDeviceIds.length === filteredDevices.length}
                                                    onChange={toggleSelectAll}
                                                />
                                            </th>
                                            <th className="px-4 py-3">Status</th>
                                            <th className="px-4 py-3">Device ID</th>
                                            <th className="px-4 py-3">SN / Model</th>
                                            <th className="px-4 py-3">IP Address</th>
                                            <th className="px-4 py-3">SSID</th>
                                            <th className="px-4 py-3">RX Power</th>
                                            <th className="px-4 py-3 text-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-800">
                                        {filteredDevices.map((dev) => (
                                            <tr
                                                key={dev._id}
                                                className={clsx(
                                                    "hover:bg-slate-800/30 transition-colors group",
                                                    selectedDeviceIds.includes(dev._id) && "bg-primary/5"
                                                )}
                                            >
                                                <td className="px-4 py-3">
                                                    <input
                                                        type="checkbox"
                                                        className="rounded border-slate-700 bg-slate-900 text-primary focus:ring-primary h-4 w-4 cursor-pointer"
                                                        checked={selectedDeviceIds.includes(dev._id)}
                                                        onChange={() => toggleSelectDevice(dev._id)}
                                                    />
                                                </td>
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center gap-2">
                                                        <span className={clsx("w-2 h-2 rounded-full",
                                                            dev._lastInform && (new Date(dev._lastInform).getTime() > Date.now() - 5 * 60 * 1000)
                                                                ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"
                                                                : "bg-red-500"
                                                        )}></span>
                                                        <span className="text-[10px] text-slate-500 uppercase font-medium">
                                                            {dev._lastInform && (new Date(dev._lastInform).getTime() > Date.now() - 5 * 60 * 1000) ? "Online" : "Offline"}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <div className="text-sm font-medium text-white">{dev._id}</div>
                                                    <div className="text-[10px] text-slate-500 font-mono">
                                                        Last Inform: {dev._lastInform ? formatDateWithTimezone(dev._lastInform, timezone) : 'Never'}
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <div className="text-sm text-primary font-mono">{dev._serialNumber || 'N/A'}</div>
                                                    <div className="text-[10px] text-slate-400 font-bold">{dev._productClass || 'Unknown Model'}</div>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span className="text-sm text-slate-300 font-mono">{dev._ip || 'N/A'}</span>
                                                </td>
                                                <td className="px-4 py-3 text-sm text-slate-300">
                                                    <div className="truncate w-32" title={dev._ssid}>{dev._ssid || 'N/A'}</div>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span className={clsx("text-sm font-mono font-bold",
                                                        !dev._rxPower ? "text-slate-500" :
                                                            parseFloat(dev._rxPower) < -25 ? "text-red-400" : "text-emerald-400"
                                                    )}>
                                                        {dev._rxPower ? `${dev._rxPower} dBm` : 'N/A'}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3">
                                                    <div className="flex justify-end gap-1">
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); refreshMutation.mutate({ id: dev._id, routerId: selectedRouterId }); }}
                                                            className="p-1.5 rounded-md hover:bg-slate-700 text-slate-400 hover:text-blue-400 transition-colors"
                                                            title="Refresh (Summon)"
                                                        >
                                                            <RefreshCw className={clsx("w-3.5 h-3.5", refreshMutation?.isPending && refreshMutation.variables?.id === dev._id && "animate-spin")} />
                                                        </button>
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); setWifiDevice({ ...dev, routerId: selectedRouterId }); }}
                                                            className="p-1.5 rounded-md hover:bg-slate-700 text-slate-400 hover:text-emerald-400 transition-colors"
                                                            title="WiFi Settings"
                                                        >
                                                            <Wifi className="w-3.5 h-3.5" />
                                                        </button>
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); setDetailDeviceId(dev._id); }}
                                                            className="p-1.5 rounded-md hover:bg-slate-700 text-slate-400 hover:text-primary transition-colors"
                                                            title="View Details"
                                                        >
                                                            <Info className="w-3.5 h-3.5" />
                                                        </button>
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); setRebootDevice({ ...dev, routerId: selectedRouterId }); }}
                                                            className="p-1.5 rounded-md hover:bg-slate-700 text-slate-400 hover:text-red-400 transition-colors"
                                                            title="Reboot Device"
                                                        >
                                                            <Power className="w-3.5 h-3.5" />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                            {filteredDevices.map((dev) => (
                                <Card
                                    key={dev._id}
                                    className={clsx(
                                        "group transition-all duration-200 relative border",
                                        selectedDeviceIds.includes(dev._id) ? "border-primary bg-primary/5" : "border-slate-800 hover:border-slate-600"
                                    )}
                                >
                                    <div className="absolute top-3 right-3 z-10">
                                        <input
                                            type="checkbox"
                                            className="rounded border-slate-700 bg-slate-900 text-primary focus:ring-primary h-4 w-4 cursor-pointer"
                                            checked={selectedDeviceIds.includes(dev._id)}
                                            onChange={() => toggleSelectDevice(dev._id)}
                                        />
                                    </div>

                                    <CardContent className="p-5 space-y-4" onClick={(e) => {
                                        if (e.target.tagName !== 'BUTTON' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'svg' && e.target.tagName !== 'path') {
                                            toggleSelectDevice(dev._id);
                                        }
                                    }}>
                                        <div className="flex items-start justify-between">
                                            <div className="flex items-center gap-3">
                                                <div className={clsx("p-2.5 rounded-lg",
                                                    dev._lastInform && (new Date(dev._lastInform).getTime() > Date.now() - 5 * 60 * 1000)
                                                        ? "bg-emerald-500/10 text-emerald-500"
                                                        : "bg-red-500/10 text-red-500"
                                                )}>
                                                    <Wifi className="w-5 h-5" />
                                                </div>
                                                <div>
                                                    <h3 className="font-semibold text-white truncate w-32" title={dev._id}>{dev._id}</h3>
                                                    <div className="flex flex-col gap-0.5">
                                                        <div className="text-[10px] text-primary font-mono">{dev._serialNumber || 'No SN'}</div>
                                                        <div className="flex items-center gap-2">
                                                            <div className="text-[10px] text-slate-400 font-bold">{dev._productClass || 'Unknown Model'}</div>
                                                            <span className={clsx("w-1.5 h-1.5 rounded-full",
                                                                dev._lastInform && (new Date(dev._lastInform).getTime() > Date.now() - 5 * 60 * 1000)
                                                                    ? "bg-emerald-500"
                                                                    : "bg-red-500"
                                                            )} title={dev._lastInform && (new Date(dev._lastInform).getTime() > Date.now() - 5 * 60 * 1000) ? "Online" : "Offline"}></span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity mr-10">
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); refreshMutation.mutate({ id: dev._id, routerId: selectedRouterId }); }}
                                                    className="p-1.5 rounded-md hover:bg-slate-700 text-slate-400 hover:text-blue-400 transition-colors"
                                                    title="Refresh (Summon)"
                                                >
                                                    <RefreshCw className={clsx("w-4 h-4", refreshMutation?.isPending && refreshMutation.variables?.id === dev._id && "animate-spin")} />
                                                </button>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); setWifiDevice({ ...dev, routerId: selectedRouterId }); }}
                                                    className="p-1.5 rounded-md hover:bg-slate-700 text-slate-400 hover:text-emerald-400 transition-colors"
                                                    title="WiFi Settings"
                                                >
                                                    <Wifi className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); setWanDevice({ ...dev, routerId: selectedRouterId }); }}
                                                    className="p-1.5 rounded-md hover:bg-slate-700 text-slate-400 hover:text-blue-400 transition-colors"
                                                    title="WAN Settings"
                                                >
                                                    <Globe className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); setDetailDeviceId(dev._id); }}
                                                    className="p-1.5 rounded-md hover:bg-slate-700 text-slate-400 hover:text-primary transition-colors"
                                                    title="View Details"
                                                >
                                                    <Info className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); setRebootDevice({ ...dev, routerId: selectedRouterId }); }}
                                                    className="p-1.5 rounded-md hover:bg-slate-700 text-slate-400 hover:text-red-400 transition-colors"
                                                    title="Reboot Device"
                                                >
                                                    <Power className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-y-3 gap-x-2 text-sm">
                                            <div className="flex flex-col">
                                                <span className="text-slate-500 text-xs">IP Address</span>
                                                <span className="text-slate-300 font-mono text-xs">{dev._ip || 'N/A'}</span>
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="text-slate-500 text-xs">RX Power</span>
                                                <span className={clsx("font-mono text-xs",
                                                    !dev._rxPower ? "text-slate-500" :
                                                        parseFloat(dev._rxPower) < -25 ? "text-red-400" : "text-emerald-400"
                                                )}>
                                                    {dev._rxPower ? `${dev._rxPower} dBm` : 'N/A'}
                                                </span>
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="text-slate-500 text-xs">SSID</span>
                                                <span className="text-slate-300 truncate" title={dev._ssid}>{dev._ssid || 'N/A'}</span>
                                            </div>
                                            <div className="col-span-2 flex flex-col">
                                                <span className="text-slate-500 text-xs">Last Inform</span>
                                                <div className="flex items-center gap-1.5 text-slate-300">
                                                    <Clock className="w-3 h-3" />
                                                    <span className="text-xs">
                                                        {dev._lastInform ? formatDateWithTimezone(dev._lastInform, timezone) : 'Never'}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        {dev._lastInform && (
                                            <div className="pt-2">
                                                <div className={clsx(
                                                    "h-1 rounded-full w-full",
                                                    new Date() - new Date(dev._lastInform) < 300000
                                                        ? "bg-emerald-500"
                                                        : new Date() - new Date(dev._lastInform) < 3600000
                                                            ? "bg-yellow-500"
                                                            : "bg-red-500"
                                                )} />
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    )
                ) : (
                    <div className="col-span-full py-12 text-center border-2 border-dashed border-slate-800 rounded-xl">
                        <div className="w-12 h-12 bg-slate-800/50 text-slate-500 rounded-full flex items-center justify-center mx-auto mb-4">
                            <Monitor className="w-6 h-6" />
                        </div>
                        <h3 className="text-lg font-medium text-white mb-1">No devices found</h3>
                        <p className="text-slate-400">GenieACS didn't return any devices matching your search</p>
                    </div>
                )}
            </div>

            <RebootModal
                isOpen={!!rebootDevice}
                onClose={() => setRebootDevice(null)}
                device={rebootDevice}
            />

            <WifiConfigModal
                isOpen={!!wifiDevice}
                onClose={() => setWifiDevice(null)}
                device={wifiDevice}
            />

            <WanConfigModal
                isOpen={!!wanDevice}
                onClose={() => setWanDevice(null)}
                device={wanDevice}
            />

            <DeviceDetailModal
                isOpen={!!detailDeviceId}
                onClose={() => setDetailDeviceId(null)}
                deviceId={detailDeviceId}
                routerId={selectedRouterId}
            />

            <PresetManagerModal
                isOpen={showPresetManager}
                onClose={() => setShowPresetManager(false)}
                onApply={selectedDeviceIds.length > 0 ? handleApplyPreset : undefined}
            />
        </div >
    );
}
