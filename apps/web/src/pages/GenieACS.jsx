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
    useBulkRebootGenieAcs,
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
    List,
    Thermometer,
    Settings,
    Network,
    FileText,
    ArrowRight,
    Laptop,
    Signal
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
import GenieACSDashboard from './genieacs/GenieACSDashboard';

function DeviceDetailModal({ isOpen, onClose, deviceId, routerId, onOpenWanConfig, onOpenWifiConfig }) {
    const [search, setSearch] = useState('');
    const [activeTab, setActiveTab] = useState('summary');

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
        if (!obj) return [];
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

    // Data Extraction Helpers
    const getSoftwareVersion = () => {
        return fullDevice?.InternetGatewayDevice?.DeviceInfo?.SoftwareVersion?._value ||
            fullDevice?.Device?.DeviceInfo?.SoftwareVersion?._value || 'N/A';
    };

    const getUptime = () => {
        const uptimeSeconds = fullDevice?.InternetGatewayDevice?.DeviceInfo?.UpTime?._value ||
            fullDevice?.Device?.DeviceInfo?.UpTime?._value || 0;
        if (!uptimeSeconds) return 'N/A';

        const d = Math.floor(uptimeSeconds / (3600 * 24));
        const h = Math.floor(uptimeSeconds % (3600 * 24) / 3600);
        const m = Math.floor(uptimeSeconds % 3600 / 60);

        return d > 0 ? `${d}d ${h}h ${m}m` : `${h}h ${m}m`;
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={fullDevice ? `Device Detail: ${fullDevice._id}` : 'Loading...'}
            size="2xl"
        >
            <div className="flex flex-col h-[75vh]">
                {isLoading ? (
                    <div className="flex-1 flex flex-col items-center justify-center space-y-3">
                        <RefreshCw className="w-8 h-8 animate-spin text-primary" />
                        <p className="text-slate-400 animate-pulse text-sm">Synchronizing with CPE...</p>
                    </div>
                ) : (
                    <div className="flex flex-col h-full">
                        {/* Tab Bar Container */}
                        <div className="flex overflow-x-auto border-b border-slate-800 scrollbar-hide mb-4">
                            {[
                                { id: 'summary', label: 'Summary', icon: Info },
                                { id: 'wan', label: 'WAN / Network', icon: Globe },
                                { id: 'wifi', label: 'Radio / WiFi', icon: Wifi },
                                { id: 'advanced', label: 'Advanced Parameters', icon: Settings },
                            ].map((tab) => (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id)}
                                    className={clsx(
                                        "flex items-center gap-2 px-6 py-3 border-b-2 transition-all whitespace-nowrap text-sm font-bold uppercase tracking-wider",
                                        activeTab === tab.id
                                            ? "border-primary text-primary bg-primary/5"
                                            : "border-transparent text-slate-500 hover:text-slate-300 hover:bg-slate-800/30"
                                    )}
                                >
                                    <tab.icon className="w-4 h-4" />
                                    {tab.label}
                                </button>
                            ))}
                        </div>

                        {/* Tab Content */}
                        <div className="flex-1 overflow-auto custom-scrollbar pr-1">
                            {activeTab === 'summary' && (
                                <div className="space-y-6 animate-in fade-in slide-in-from-left-2 duration-300">
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                        <Card className="bg-slate-900/50 border-slate-800">
                                            <CardContent className="p-4">
                                                <div className="flex items-center gap-3 mb-2">
                                                    <div className="p-2 bg-blue-500/10 text-blue-400 rounded-lg">
                                                        <Monitor className="w-5 h-5" />
                                                    </div>
                                                    <div>
                                                        <div className="text-[10px] text-slate-500 uppercase font-bold tracking-tighter">Identity</div>
                                                        <div className="text-sm text-white font-medium truncate w-32">{fullDevice?._id}</div>
                                                    </div>
                                                </div>
                                                <div className="space-y-1.5 pt-2 border-t border-slate-800/50">
                                                    <div className="flex justify-between text-xs">
                                                        <span className="text-slate-500">Manufacturer</span>
                                                        <span className="text-slate-300">{fullDevice?._deviceId?._Manufacturer || 'N/A'}</span>
                                                    </div>
                                                    <div className="flex justify-between text-xs">
                                                        <span className="text-slate-500">Product Class</span>
                                                        <span className="text-slate-300">{fullDevice?._deviceId?._ProductClass || 'N/A'}</span>
                                                    </div>
                                                    <div className="flex justify-between text-xs font-mono">
                                                        <span className="text-slate-500 font-sans">Serial</span>
                                                        <span className="text-primary">{fullDevice?._deviceId?._SerialNumber || 'N/A'}</span>
                                                    </div>
                                                </div>
                                            </CardContent>
                                        </Card>

                                        <Card className="bg-slate-900/50 border-slate-800">
                                            <CardContent className="p-4">
                                                <div className="flex items-center gap-3 mb-2">
                                                    <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-lg">
                                                        <Activity className="w-5 h-5" />
                                                    </div>
                                                    <div>
                                                        <div className="text-[10px] text-slate-500 uppercase font-bold tracking-tighter">Status</div>
                                                        <div className="text-sm text-white font-medium">Online</div>
                                                    </div>
                                                </div>
                                                <div className="space-y-1.5 pt-2 border-t border-slate-800/50">
                                                    <div className="flex justify-between text-xs">
                                                        <span className="text-slate-500">Uptime</span>
                                                        <span className="text-emerald-400 font-bold">{getUptime()}</span>
                                                    </div>
                                                    <div className="flex justify-between text-xs">
                                                        <span className="text-slate-500">Software</span>
                                                        <span className="text-slate-300">{getSoftwareVersion()}</span>
                                                    </div>
                                                    <div className="flex justify-between text-xs">
                                                        <span className="text-slate-500">Hardware</span>
                                                        <span className="text-slate-300">{fullDevice?._deviceId?._HardwareVersion || 'N/A'}</span>
                                                    </div>
                                                </div>
                                            </CardContent>
                                        </Card>

                                        <Card className="bg-slate-900/50 border-slate-800">
                                            <CardContent className="p-4">
                                                <div className="flex items-center gap-3 mb-2">
                                                    <div className="p-2 bg-purple-500/10 text-purple-400 rounded-lg">
                                                        <Globe className="w-5 h-5" />
                                                    </div>
                                                    <div>
                                                        <div className="text-[10px] text-slate-500 uppercase font-bold tracking-tighter">Connection</div>
                                                        <div className="text-sm text-white font-medium">{fullDevice?._ip || '0.0.0.0'}</div>
                                                    </div>
                                                </div>
                                                <div className="space-y-1.5 pt-2 border-t border-slate-800/50">
                                                    <div className="flex justify-between text-xs">
                                                        <span className="text-slate-500">PPPoE User</span>
                                                        <span className="text-primary font-medium">{fullDevice?._pppoeUser || 'N/A'}</span>
                                                    </div>
                                                    <div className="flex justify-between text-xs">
                                                        <span className="text-slate-500">Connection</span>
                                                        <span className="text-slate-300">TR-069 Session</span>
                                                    </div>
                                                    <div className="flex justify-between text-xs">
                                                        <span className="text-slate-500">Rx Power</span>
                                                        <span className="text-amber-400 font-bold font-mono">{fullDevice?._rxPower || 'N/A'} dBm</span>
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
                            )}

                            {activeTab === 'wan' && (
                                <div className="space-y-4 animate-in fade-in slide-in-from-right-2 duration-300">
                                    <div className="bg-slate-900/50 p-6 rounded-xl border border-slate-800">
                                        <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4">WAN Interface Details</h4>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
                                            <div className="flex justify-between py-2 border-b border-slate-800">
                                                <span className="text-sm text-slate-400">External IP</span>
                                                <span className="text-sm text-white font-mono">{fullDevice?._ip || 'N/A'}</span>
                                            </div>
                                            <div className="flex justify-between py-2 border-b border-slate-800">
                                                <span className="text-sm text-slate-400">Connection Mode</span>
                                                <span className="text-sm text-white">PPPoE</span>
                                            </div>
                                            <div className="flex justify-between py-2 border-b border-slate-800">
                                                <span className="text-sm text-slate-400">MAC Address</span>
                                                <span className="text-sm text-white font-mono">{fullDevice?._macAddress || 'N/A'}</span>
                                            </div>
                                            <div className="flex justify-between py-2 border-b border-slate-800">
                                                <span className="text-sm text-slate-400">Status</span>
                                                <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-500 text-[10px] font-bold rounded uppercase">Connected</span>
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
                                                <div className="text-sm font-bold text-white">Advanced WAN Management</div>
                                                <div className="text-[10px] text-slate-500">Configure VLAN, Bridge, and Routing settings</div>
                                            </div>
                                        </div>
                                        <ArrowRight className="w-5 h-5 text-slate-700 group-hover:text-primary transition-colors" />
                                    </div>
                                </div>
                            )}

                            {activeTab === 'wifi' && (
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
                                                    <span className="text-[10px] font-bold px-2 py-0.5 bg-emerald-500/10 text-emerald-500 rounded uppercase">Enabled</span>
                                                </div>
                                                <div className="flex justify-between items-center">
                                                    <span className="text-sm text-slate-400">Channel</span>
                                                    <span className="text-sm text-white font-mono">Auto (6)</span>
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
                            )}

                            {activeTab === 'advanced' && (
                                <div className="flex flex-col h-full animate-in fade-in duration-300">
                                    <div className="relative mb-4">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                                        <input
                                            type="text"
                                            placeholder="Search TR-069 parameters..."
                                            value={search}
                                            onChange={(e) => setSearch(e.target.value)}
                                            className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-10 pr-4 py-2 text-sm text-white focus:ring-1 focus:ring-primary outline-none"
                                        />
                                    </div>
                                    <div className="flex-1 bg-slate-950/50 rounded-xl border border-slate-900 p-2 custom-scrollbar overflow-auto">
                                        {flattenedParams.length === 0 ? (
                                            <div className="h-full flex flex-col items-center justify-center text-slate-500 font-medium italic text-sm">
                                                No parameters found
                                            </div>
                                        ) : (
                                            <div className="space-y-1">
                                                {flattenedParams.map(item => renderParamRow(item.path, item.data, item.isObject))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="mt-6 flex justify-between items-center pt-4 border-t border-slate-800">
                            <div className="flex gap-2">
                                <Button variant="secondary" size="sm" onClick={() => window.location.reload()}>
                                    <RefreshCw className="w-3.5 h-3.5 mr-2" />
                                    Synchronize
                                </Button>
                            </div>
                            <Button variant="ghost" onClick={onClose}>Close Detail</Button>
                        </div>
                    </div>
                )}
            </div>
        </Modal>
    );
}

function RebootModal({ isOpen, onClose, device }) {
    const rebootMutation = useRebootGenieACSDevice();

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

function WiFiConfigModalComponent({ isOpen, onClose, device }) {
    const [ssid, setSsid] = useState('');
    const [password, setPassword] = useState('');
    const updateParamMutation = useUpdateGenieACSParameter();

    useEffect(() => {
        if (device && isOpen) {
            setSsid(device._ssid || '');
            setPassword('');
        }
    }, [device, isOpen]);

    const handleSave = async () => {
        if (!device) return;

        try {
            const isTr181 = !!device._isTr181;
            const ssidPath = isTr181
                ? 'Device.WiFi.SSID.1.SSID'
                : 'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.SSID';
            const passwordPath = isTr181
                ? 'Device.WiFi.AccessPoint.1.Security.KeyPassphrase'
                : 'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.PreSharedKey.1.KeyPassphrase';

            if (ssid !== device._ssid) {
                await updateParamMutation.mutateAsync({
                    id: device._id,
                    routerId: device.routerId,
                    parameterName: ssidPath,
                    value: ssid
                });
            }

            if (password) {
                await updateParamMutation.mutateAsync({
                    id: device._id,
                    routerId: device.routerId,
                    parameterName: passwordPath,
                    value: password
                });
            }

            onClose();
        } catch (error) { }
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
    const [statusFilter, setStatusFilter] = useState('all');
    const [vendorFilter, setVendorFilter] = useState('all');
    const [pageTab, setPageTab] = useState('dashboard'); // New state for top-level tabs

    const refreshMutation = useRefreshGenieACSDevice();

    const { data: routers = [] } = useRouters();
    const acsEnabledRouters = routers.filter(r => r.useGenieAcs);

    useEffect(() => {
        if (!selectedRouterId && acsEnabledRouters.length > 0) {
            setSelectedRouterId(acsEnabledRouters[0].id);
        }
    }, [acsEnabledRouters, selectedRouterId]);

    const { data: currentUser } = useCurrentUser();
    const isAdmin = currentUser?.role === 'admin' || currentUser?.role === 'superadmin';

    const { data: devices = [], isLoading, error, refetch } = useGenieACSDevices(selectedRouterId, {
        refetchInterval: 60 * 1000,
        enabled: !!selectedRouterId || isAdmin
    });
    const { data: netwatchEntries = [] } = useRouterNetwatch(selectedRouterId, { enabled: !!selectedRouterId });
    const { data: settings } = useSettings();
    const timezone = useAppTimezone();

    // Create a lookup for netwatch to identify linked devices
    const netwatchLookup = useMemo(() => {
        const map = new Map();
        (netwatchEntries || []).forEach(entry => {
            if (entry.sn) map.set(entry.sn, entry);
            if (entry.host) map.set(entry.host, entry);
            if (entry.address) map.set(entry.address, entry);
        });
        return map;
    }, [netwatchEntries]);

    // Helper for Status Dots & Labels (Match reference image)
    const StatusBadge = ({ value, label, colorClass, icon: Icon }) => (
        <div className="flex items-center gap-1.5 min-w-fit">
            {Icon && <Icon className="w-3 h-3 text-slate-400" />}
            <span className="text-xs font-bold text-white whitespace-nowrap">{value}</span>
            <span className={clsx("w-1.5 h-1.5 rounded-full shrink-0", colorClass)}></span>
            <span className="text-[10px] text-slate-500 uppercase font-bold tracking-tight">{label}</span>
        </div>
    );

    const getSignalStatusInfo = (rssi) => {
        if (!rssi) return { label: 'No Signal', color: 'bg-slate-700', value: 'N/A' };
        const val = parseFloat(rssi);
        if (val >= -20) return { label: 'Excellent', color: 'bg-emerald-500', value: `${val} dBm` };
        if (val >= -24) return { label: 'Lumayan', color: 'bg-amber-500', value: `${val} dBm` };
        if (val >= -27) return { label: 'Fair', color: 'bg-orange-500', value: `${val} dBm` };
        return { label: 'Poor', color: 'bg-red-500', value: `${val} dBm` };
    };

    const getTempStatusInfo = (temp) => {
        if (!temp) return null;
        const val = parseFloat(temp);
        if (val < 50) return { label: 'Cool', color: 'bg-emerald-500', value: `${val} °C` };
        if (val <= 65) return { label: 'Normal', color: 'bg-amber-500', value: `${val} °C` };
        return { label: 'Hot', color: 'bg-red-500', value: `${val} °C` };
    };

    const getClientStatusInfo = (count) => {
        const val = parseInt(count || 0);
        if (val === 0) return { label: 'Idle', color: 'bg-slate-600', value: '0 Device' };
        if (val <= 3) return { label: 'Low', color: 'bg-emerald-500', value: `${val} Device` };
        if (val <= 6) return { label: 'Medium', color: 'bg-amber-500', value: `${val} Device` };
        return { label: 'High', color: 'bg-red-500', value: `${val} Device` };
    };

    const filteredDevices = devices.filter(dev => {
        const matchesSearch = dev._id.toLowerCase().includes(searchQuery.toLowerCase()) ||
            dev._ip?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            dev._serialNumber?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            dev._ssid?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            dev._tags?.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()));

        const isOnline = dev._lastInform && (new Date(dev._lastInform).getTime() > Date.now() - 5 * 60 * 1000);
        const matchesStatus = statusFilter === 'all' ||
            (statusFilter === 'online' && isOnline) ||
            (statusFilter === 'offline' && !isOnline);

        const matchesVendor = vendorFilter === 'all' || dev._manufacturer === vendorFilter;

        return matchesSearch && matchesStatus && matchesVendor;
    });

    const vendors = [...new Set(devices.map(d => d._manufacturer).filter(Boolean))];

    const [selectedDeviceIds, setSelectedDeviceIds] = useState([]);
    const [showPresetManager, setShowPresetManager] = useState(false);

    const bulkRebootMutation = useBulkRebootGenieAcs();
    const bulkPushConfigMutation = useBulkPushConfigGenieAcs();

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
            <div className="px-6 pt-6 border-b border-slate-800 bg-slate-900/20">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                    <div>
                        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                            <Monitor className="w-8 h-8 text-primary" />
                            GenieACS Management
                        </h1>
                        <p className="text-slate-400 text-sm">Unified TR-069 Monitoring & Orchestration</p>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-3">
                        {selectedDeviceIds.length > 0 && pageTab === 'devices' ? (
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
                                            {isAdmin && <option value="">Global ACS View</option>}
                                            {acsEnabledRouters.map(router => (
                                                <option key={router.id} value={router.id}>
                                                    {router.name}
                                                </option>
                                            ))}
                                        </select>
                                        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                                    </div>
                                )}

                                {pageTab === 'devices' && (
                                    <>
                                        <div className="relative">
                                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                                            <input
                                                type="text"
                                                placeholder="Search serial, IP..."
                                                value={searchQuery}
                                                onChange={(e) => setSearchQuery(e.target.value)}
                                                className="bg-slate-900 border border-slate-700 text-white text-sm rounded-lg pl-9 pr-3 py-2 focus:ring-1 focus:ring-primary focus:border-primary w-full sm:w-48"
                                            />
                                        </div>
                                        <Button onClick={() => setShowPresetManager(true)} variant="secondary" size="sm">
                                            <Database className="w-4 h-4 mr-2" /> Presets
                                        </Button>
                                        <div className="flex bg-slate-900 border border-slate-700 rounded-lg p-1">
                                            <button
                                                onClick={() => setViewMode('grid')}
                                                className={clsx("p-1.5 rounded-md transition-all", viewMode === 'grid' ? "bg-primary text-white" : "text-slate-400 hover:text-white")}
                                            >
                                                <LayoutGrid className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => setViewMode('list')}
                                                className={clsx("p-1.5 rounded-md transition-all", viewMode === 'list' ? "bg-primary text-white" : "text-slate-400 hover:text-white")}
                                            >
                                                <List className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </>
                                )}
                            </>
                        )}
                    </div>
                </div>

                {/* Top Level Tabs */}
                <div className="flex items-center gap-1">
                    <button
                        onClick={() => setPageTab('dashboard')}
                        className={clsx(
                            "px-6 py-3 text-sm font-bold uppercase tracking-widest transition-all border-b-2",
                            pageTab === 'dashboard' ? "border-primary text-primary bg-primary/5" : "border-transparent text-slate-500 hover:text-slate-300 hover:bg-slate-800/30"
                        )}
                    >
                        Network Overview
                    </button>
                    <button
                        onClick={() => setPageTab('devices')}
                        className={clsx(
                            "px-6 py-3 text-sm font-bold uppercase tracking-widest transition-all border-b-2",
                            pageTab === 'devices' ? "border-primary text-primary bg-primary/5" : "border-transparent text-slate-500 hover:text-slate-300 hover:bg-slate-800/30"
                        )}
                    >
                        Device Management
                    </button>
                </div>
            </div>

            {pageTab === 'devices' ? (
                <>
                    {/* Filter Chips Bar */}
                    <div className="px-6 py-3 bg-slate-900/40 border-b border-slate-800 flex flex-wrap items-center gap-4">
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Status:</span>
                            <div className="flex bg-slate-950 p-1 rounded-lg border border-slate-800">
                                {['all', 'online', 'offline'].map(s => (
                                    <button
                                        key={s}
                                        onClick={() => setStatusFilter(s)}
                                        className={clsx(
                                            "px-3 py-1 text-[10px] font-bold rounded-md transition-all capitalize",
                                            statusFilter === s ? "bg-primary text-white shadow-lg shadow-primary/20" : "text-slate-500 hover:text-slate-300"
                                        )}
                                    >
                                        {s}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Vendor:</span>
                            <select
                                value={vendorFilter}
                                onChange={(e) => setVendorFilter(e.target.value)}
                                className="bg-slate-950 border border-slate-800 text-[10px] text-slate-300 font-bold rounded-lg px-2 py-1 outline-none focus:ring-1 focus:ring-primary"
                            >
                                <option value="all">ALL VENDORS</option>
                                {vendors.map(v => (
                                    <option key={v} value={v}>{v.toUpperCase()}</option>
                                ))}
                            </select>
                        </div>

                        <div className="ml-auto text-[10px] text-slate-500 font-medium">
                            Found <span className="text-white font-bold">{filteredDevices.length}</span> devices
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
                                                    <th className="px-4 py-3">Device / SN</th>
                                                    <th className="px-4 py-3">VLAN</th>
                                                    <th className="px-4 py-3">Model / Type</th>
                                                    <th className="px-4 py-3">MAC / IP Address</th>
                                                    <th className="px-4 py-3">Signal / Clients</th>
                                                    <th className="px-4 py-3">Suhu</th>
                                                    <th className="px-4 py-3">Tags</th>
                                                    <th className="px-4 py-3 text-right">Actions</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-800">
                                                {filteredDevices.map((dev) => (
                                                    <tr
                                                        key={dev._id}
                                                        className={clsx(
                                                            "hover:bg-slate-800/30 transition-colors group h-16",
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
                                                                    {dev._lastInform && (new Date(dev._lastInform).getTime() > Date.now() - 5 * 60 * 1000) ? "Active" : "Idle"}
                                                                </span>
                                                            </div>
                                                        </td>
                                                        <td className="px-4 py-3">
                                                            <div className="text-sm font-bold text-white group-hover:text-primary transition-colors cursor-pointer" onClick={() => setDetailDeviceId(dev._id)}>
                                                                {dev._id}
                                                            </div>
                                                            <div className="flex items-center gap-2 overflow-hidden">
                                                                <div className="text-[10px] text-slate-500 font-mono truncate">
                                                                    SN: {dev._serialNumber || 'N/A'}
                                                                </div>
                                                                {dev._serialNumber && netwatchLookup.has(dev._serialNumber) && (
                                                                    <div className="px-1 bg-emerald-500/10 text-emerald-500 text-[8px] font-bold uppercase border border-emerald-500/20 rounded-sm flex items-center gap-0.5 shrink-0" title="Already linked with Netwatch (Location Inherited)">
                                                                        <Activity className="w-2 h-2" />
                                                                        Linked
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </td>
                                                        <td className="px-4 py-3">
                                                            <div className="flex flex-wrap gap-1 max-w-[120px]">
                                                                {(dev._vlan || '').split(',').map(v => v.trim()).filter(v => v).map(vlan => (
                                                                    <div key={vlan} className="flex items-center gap-1 bg-slate-950/50 px-1.5 py-0.5 rounded border border-slate-800 shrink-0">
                                                                        <span className="text-[9px] text-slate-500 font-bold uppercase tracking-tight">ID:</span>
                                                                        <span className="text-[10px] font-bold text-primary font-mono">{vlan}</span>
                                                                    </div>
                                                                ))}
                                                                {(!dev._vlan) && (
                                                                    <span className="text-[10px] text-slate-700 font-bold uppercase tracking-tight italic">N/A</span>
                                                                )}
                                                            </div>
                                                        </td>
                                                        <td className="px-4 py-3">
                                                            <div className="text-sm text-slate-200 font-medium">{dev._productClass || 'Unknown'}</div>
                                                            <div className="text-[10px] text-slate-500 font-bold uppercase">{dev._manufacturer || 'Unknown Vendor'}</div>
                                                        </td>
                                                        <td className="px-4 py-3">
                                                            <div className="text-[11px] text-slate-300 font-mono group-hover:text-white transition-colors">
                                                                {dev._macAddress || 'No MAC'}
                                                            </div>
                                                            <div className="text-[10px] text-primary font-mono">{dev._ip || '0.0.0.0'}</div>
                                                        </td>
                                                        <td className="px-4 py-3">
                                                            <div className="flex flex-col gap-1.5">
                                                                {/* Signal Status */}
                                                                {(() => {
                                                                    const info = getSignalStatusInfo(dev._rxPower);
                                                                    return <StatusBadge value={info.value} label={info.label} colorClass={info.color} icon={Signal} />;
                                                                })()}

                                                                {/* Active Clients Status */}
                                                                {(() => {
                                                                    const info = getClientStatusInfo(dev._clientCount);
                                                                    return <StatusBadge value={info.value} label={info.label} colorClass={info.color} icon={Laptop} />;
                                                                })()}
                                                            </div>
                                                        </td>
                                                        <td className="px-4 py-3">
                                                            {/* Temperature Status */}
                                                            {dev._temperature ? (() => {
                                                                const info = getTempStatusInfo(dev._temperature);
                                                                return <StatusBadge value={info.value} label={info.label} colorClass={info.color} icon={Thermometer} />;
                                                            })() : (
                                                                <span className="text-[10px] text-slate-700 font-bold uppercase tracking-tight italic">N/A</span>
                                                            )}
                                                        </td>
                                                        <td className="px-4 py-3">
                                                            <div className="flex flex-wrap gap-1 max-w-[150px]">
                                                                {dev._tags?.map(tag => (
                                                                    <span
                                                                        key={tag}
                                                                        className="px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[9px] font-bold uppercase tracking-tight border border-primary/20"
                                                                    >
                                                                        {tag}
                                                                    </span>
                                                                ))}
                                                                {(!dev._tags || dev._tags.length === 0) && (
                                                                    <span className="text-[10px] text-slate-600 font-medium italic">No tags</span>
                                                                )}
                                                            </div>
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
                                                        <span className="text-slate-500 text-xs font-bold uppercase tracking-wider">IP Address</span>
                                                        <span className="text-slate-300 font-mono text-xs">{dev._ip || 'N/A'}</span>
                                                    </div>
                                                    <div className="flex flex-col">
                                                        <span className="text-slate-500 text-xs font-bold uppercase tracking-wider">RX Power</span>
                                                        {(() => {
                                                            const info = getSignalStatusInfo(dev._rxPower);
                                                            return (
                                                                <div className="flex items-center gap-1 mt-0.5">
                                                                    <span className="text-xs font-bold text-white">{info.value}</span>
                                                                    <span className={clsx("w-1.5 h-1.5 rounded-full", info.color)}></span>
                                                                </div>
                                                            );
                                                        })()}
                                                    </div>
                                                    <div className="flex flex-col">
                                                        <span className="text-slate-500 text-xs font-bold uppercase tracking-wider">Temp / Clients</span>
                                                        <div className="flex flex-col gap-1 mt-0.5">
                                                            {dev._temperature && (() => {
                                                                const info = getTempStatusInfo(dev._temperature);
                                                                return (
                                                                    <div className="flex items-center gap-1">
                                                                        <span className="text-[11px] font-bold text-white">{info.value}</span>
                                                                        <span className={clsx("w-1 h-1 rounded-full", info.color)}></span>
                                                                    </div>
                                                                );
                                                            })()}
                                                            {(() => {
                                                                const info = getClientStatusInfo(dev._clientCount);
                                                                return (
                                                                    <div className="flex items-center gap-1">
                                                                        <span className="text-[11px] font-bold text-white">{info.value}</span>
                                                                        <span className={clsx("w-1 h-1 rounded-full", info.color)}></span>
                                                                    </div>
                                                                );
                                                            })()}
                                                        </div>
                                                    </div>
                                                    <div className="flex flex-col">
                                                        <span className="text-slate-500 text-xs font-bold uppercase tracking-wider">Firmware</span>
                                                        <span className="text-slate-400 text-[10px] truncate" title={dev._softwareVersion}>
                                                            {dev._softwareVersion || 'Unknown'}
                                                        </span>
                                                    </div>
                                                    <div className="flex flex-col">
                                                        <span className="text-slate-500 text-xs font-bold uppercase tracking-wider">VLAN</span>
                                                        <div className="flex flex-wrap gap-1 mt-0.5">
                                                            {(dev._vlan || '').split(',').map(v => v.trim()).filter(v => v).map(vlan => (
                                                                <span key={vlan} className="text-primary font-bold text-[10px] font-mono bg-primary/5 px-1 rounded border border-primary/10">
                                                                    {vlan}
                                                                </span>
                                                            ))}
                                                            {!dev._vlan && <span className="text-slate-700 text-[10px] italic">N/A</span>}
                                                        </div>
                                                    </div>
                                                    <div className="col-span-2 flex flex-col pt-1">
                                                        <span className="text-slate-500 text-xs font-bold uppercase tracking-wider">SSID</span>
                                                        <span className="text-slate-300 truncate text-xs" title={dev._ssid}>{dev._ssid || 'N/A'}</span>
                                                    </div>
                                                </div>

                                                {dev._tags && dev._tags.length > 0 && (
                                                    <div className="flex flex-wrap gap-1.5 pt-1">
                                                        {dev._tags.map(tag => (
                                                            <span
                                                                key={tag}
                                                                className="px-2 py-0.5 rounded-md bg-slate-800/80 text-slate-300 text-[9px] font-bold uppercase tracking-wider border border-slate-700/50"
                                                            >
                                                                {tag}
                                                            </span>
                                                        ))}
                                                    </div>
                                                )}

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
                </>
            ) : (
                <div className="flex-1 overflow-auto p-6 scrollbar-hide">
                    <GenieACSDashboard selectedRouterId={selectedRouterId} />
                </div>
            )}

            <RebootModal
                isOpen={!!rebootDevice}
                onClose={() => setRebootDevice(null)}
                device={rebootDevice}
            />

            <WiFiConfigModalComponent
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
                onOpenWanConfig={(dev) => setWanDevice(dev)}
                onOpenWifiConfig={(dev) => setWifiDevice(dev)}
            />

            <PresetManagerModal
                isOpen={showPresetManager}
                onClose={() => setShowPresetManager(false)}
                onApply={selectedDeviceIds.length > 0 ? handleApplyPreset : undefined}
            />
        </div>
    );
}
