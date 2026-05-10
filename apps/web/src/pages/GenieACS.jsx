import React, { useState, useEffect, useMemo } from 'react';
import PresetManagerModal from '@/components/genieacs/PresetManagerModal';
import { Button } from '@/components/ui/Button';
import {
    useGenieACSDevices,
    useRebootGenieACSDevice,
    useRefreshGenieACSDevice,
    useUpdateGenieACSParameter,
    useCurrentUser,
    useSettings,
    useRouters,
    useRouterNetwatch,
    useBulkPushConfigGenieAcs,
    useBulkRebootGenieAcs,
    useSyncGenieACSMetadata,
    useAppTimezone
} from '@/hooks';
import {
    Monitor,
    Activity,
    Power,
    Server,
    Smartphone,
    Database,
    Network,
    ChevronDown,
    Search,
    LayoutGrid,
    List,
    RefreshCw,
} from 'lucide-react';
import WanConfigModal from '@/components/genieacs/WanConfigModal';
import WifiConfigModal from '@/components/genieacs/WifiConfigModal';
import RestoreModal from '@/components/genieacs/RestoreModal';
import { 
    useCreateGenieACSBackup 
} from '@/hooks/useGenieACS';
import clsx from 'clsx';
import { formatDateWithTimezone } from '@/lib/timezone';
import GenieACSDashboard from './genieacs/GenieACSDashboard';

// New Modular Components
import DeviceDetailModal from './genieacs/components/DeviceDetail';
import RebootModal from './genieacs/components/RebootModal';
import DeviceFilters from './genieacs/components/DeviceFilters';
import BulkActions from './genieacs/components/BulkActions';
import DeviceList from './genieacs/components/DeviceList';
import DeviceGrid from './genieacs/components/DeviceGrid';
import { DeviceGridSkeleton, DeviceListSkeleton } from './genieacs/components/GenieACSSkeleton';
import { StatusBadge, getSignalStatusInfo, getTempStatusInfo, getClientStatusInfo } from './genieacs/genie-utils.jsx';

// Device Detail Modal extracted to ./genieacs/components/DeviceDetail

// Reboot Modal extracted to ./genieacs/components/RebootModal


export default function GenieACS() {
    const [searchQuery, setSearchQuery] = useState('');
    const [rebootDevice, setRebootDevice] = useState(null);
    const [wifiDevice, setWifiDevice] = useState(null);
    const [wanDevice, setWanDevice] = useState(null);
    const [restoreDevice, setRestoreDevice] = useState(null);
    const [detailDeviceId, setDetailDeviceId] = useState(null);
    const [selectedRouterId, setSelectedRouterId] = useState('');
    const [viewMode, setViewMode] = useState(() => {
        return localStorage.getItem('genieacs-view-mode') || 'grid';
    });
    const [statusFilter, setStatusFilter] = useState('all');
    const [vendorFilter, setVendorFilter] = useState('all');
    const [pageTab, setPageTab] = useState('dashboard'); // New state for top-level tabs

    const refreshMutation = useRefreshGenieACSDevice();
    const createBackupMutation = useCreateGenieACSBackup();
    const syncMutation = useSyncGenieACSMetadata();

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

    const handleBulkRefresh = () => {
        if (!selectedDeviceIds.length) return;
        if (confirm(`Refresh (Summon) ${selectedDeviceIds.length} devices?`)) {
            selectedDeviceIds.forEach(id => {
                refreshMutation.mutate({ id, routerId: selectedRouterId });
            });
            setSelectedDeviceIds([]);
        }
    };

    const handleBulkBackup = () => {
        if (!selectedDeviceIds.length) return;
        if (confirm(`Create backups for ${selectedDeviceIds.length} devices?`)) {
            selectedDeviceIds.forEach(id => {
                createBackupMutation.mutate({ id, name: `Bulk Backup ${new Date().toLocaleDateString('id-ID')}`, routerId: selectedRouterId });
            });
            setSelectedDeviceIds([]);
        }
    };

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
            <div className="px-3 pt-3 sm:px-6 sm:pt-6 border-b border-slate-800 bg-slate-900/20">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 sm:gap-4 mb-3 sm:mb-6">
                    <div>
                        <h1 className="text-base sm:text-2xl font-bold text-white flex items-center gap-2">
                            <Monitor className="w-5 h-5 sm:w-8 sm:h-8 text-primary" />
                            GenieACS Management
                        </h1>
                        <p className="hidden sm:block text-slate-400 text-sm">Unified TR-069 Monitoring & Orchestration</p>
                    </div>

                    <div className="flex flex-wrap gap-2 sm:gap-3">
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
                                <Button
                                    onClick={() => syncMutation.mutate({ routerId: selectedRouterId || undefined })}
                                    disabled={syncMutation.isPending}
                                    variant="secondary"
                                    size="sm"
                                    title="Re-discover ONUs from ACS for the active tenant"
                                >
                                    <RefreshCw className={clsx("w-4 h-4 mr-2", syncMutation.isPending && "animate-spin")} />
                                    {syncMutation.isPending ? 'Syncing…' : 'Sync ACS'}
                                </Button>
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
                    </div>
                </div>

                {/* Top Level Tabs */}
                <div className="flex items-center gap-1">
                    <button
                        onClick={() => setPageTab('dashboard')}
                        className={clsx(
                            "px-3 sm:px-6 py-2 sm:py-3 text-xs sm:text-sm font-bold uppercase tracking-wider sm:tracking-widest transition-all border-b-2",
                            pageTab === 'dashboard' ? "border-primary text-primary bg-primary/5" : "border-transparent text-slate-500 hover:text-slate-300 hover:bg-slate-800/30"
                        )}
                    >
                        Network Overview
                    </button>
                    <button
                        onClick={() => setPageTab('devices')}
                        className={clsx(
                            "px-3 sm:px-6 py-2 sm:py-3 text-xs sm:text-sm font-bold uppercase tracking-wider sm:tracking-widest transition-all border-b-2",
                            pageTab === 'devices' ? "border-primary text-primary bg-primary/5" : "border-transparent text-slate-500 hover:text-slate-300 hover:bg-slate-800/30"
                        )}
                    >
                        Device Management
                    </button>
                </div>
            </div>

            {pageTab === 'devices' ? (
                <div className="flex-1 flex flex-col min-h-0 bg-slate-950/20">
                    <DeviceFilters
                        statusFilter={statusFilter}
                        setStatusFilter={setStatusFilter}
                        vendorFilter={vendorFilter}
                        setVendorFilter={setVendorFilter}
                        vendors={vendors}
                        deviceCount={filteredDevices.length}
                    />

                    {selectedDeviceIds.length > 0 && (
                        <BulkActions
                            selectedCount={selectedDeviceIds.length}
                            onClear={() => setSelectedDeviceIds([])}
                            onReboot={handleBulkReboot}
                            onRefresh={handleBulkRefresh}
                            onBackup={handleBulkBackup}
                            onPreset={() => setShowPresetManager(true)}
                            isRebootPending={bulkRebootMutation.isPending}
                        />
                    )}

                    <div className="flex-1 overflow-auto custom-scrollbar p-6">
                        {isLoading ? (
                            viewMode === 'grid' ? <DeviceGridSkeleton /> : <DeviceListSkeleton />
                        ) : filteredDevices.length > 0 ? (
                            viewMode === 'grid' ? (
                                <DeviceGrid
                                    devices={filteredDevices}
                                    selectedIds={selectedDeviceIds}
                                    onToggleSelect={toggleSelectDevice}
                                    onViewDetails={setDetailDeviceId}
                                    onRefresh={(id) => refreshMutation.mutate({ id, routerId: selectedRouterId })}
                                    onOpenWifi={(dev) => setWifiDevice({ ...dev, routerId: selectedRouterId })}
                                    onOpenWan={(dev) => setWanDevice({ ...dev, routerId: selectedRouterId })}
                                    onBackup={(id) => createBackupMutation.mutate({ id, name: `Manual Backup ${new Date().toLocaleDateString('id-ID')}`, routerId: selectedRouterId })}
                                    onRestore={(dev) => setRestoreDevice({ ...dev, routerId: selectedRouterId })}
                                    onReboot={(dev) => setRebootDevice({ ...dev, routerId: selectedRouterId })}
                                    refreshPendingId={refreshMutation.isPending && refreshMutation.variables?.id}
                                    backupPendingId={createBackupMutation.isPending && createBackupMutation.variables?.id}
                                    getSignalStatusInfo={getSignalStatusInfo}
                                    getTempStatusInfo={getTempStatusInfo}
                                    getClientStatusInfo={getClientStatusInfo}
                                />
                            ) : (
                                <DeviceList
                                    devices={filteredDevices}
                                    selectedIds={selectedDeviceIds}
                                    onToggleSelect={toggleSelectDevice}
                                    onToggleSelectAll={toggleSelectAll}
                                    onViewDetails={setDetailDeviceId}
                                    onRefresh={(id) => refreshMutation.mutate({ id, routerId: selectedRouterId })}
                                    onOpenWifi={(dev) => setWifiDevice({ ...dev, routerId: selectedRouterId })}
                                    onOpenWan={(dev) => setWanDevice({ ...dev, routerId: selectedRouterId })}
                                    onBackup={(id) => createBackupMutation.mutate({ id, name: `Manual Backup ${new Date().toLocaleDateString('id-ID')}`, routerId: selectedRouterId })}
                                    onRestore={(dev) => setRestoreDevice({ ...dev, routerId: selectedRouterId })}
                                    onReboot={(dev) => setRebootDevice({ ...dev, routerId: selectedRouterId })}
                                    refreshPendingId={refreshMutation.isPending && refreshMutation.variables?.id}
                                    backupPendingId={createBackupMutation.isPending && createBackupMutation.variables?.id}
                                    netwatchLookup={netwatchLookup}
                                    getSignalStatusInfo={getSignalStatusInfo}
                                    getTempStatusInfo={getTempStatusInfo}
                                    getClientStatusInfo={getClientStatusInfo}
                                />
                            )
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center py-20 bg-slate-900/20 border-2 border-dashed border-slate-800 rounded-3xl animate-in fade-in duration-500">
                                <div className="w-20 h-20 bg-slate-900 rounded-3xl flex items-center justify-center mb-6 shadow-2xl border border-slate-800">
                                    <Monitor className="w-10 h-10 text-slate-600" />
                                </div>
                                <h3 className="text-xl font-bold text-white mb-2">No Devices Found</h3>
                                <p className="text-slate-500 max-w-sm text-center">
                                    We couldn't find any devices matching your current filters. Try adjusting your search criteria.
                                </p>
                            </div>
                        )}
                    </div>
                </div>
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

            <WifiConfigModal
                isOpen={!!wifiDevice}
                onClose={() => setWifiDevice(null)}
                device={wifiDevice}
                routerId={selectedRouterId}
            />

            <WanConfigModal
                isOpen={!!wanDevice}
                onClose={() => setWanDevice(null)}
                device={wanDevice}
                routerId={selectedRouterId}
            />

            <RestoreModal
                isOpen={!!restoreDevice}
                onClose={() => setRestoreDevice(null)}
                device={restoreDevice}
                routerId={selectedRouterId}
            />

            <DeviceDetailModal
                isOpen={!!detailDeviceId}
                onClose={() => setDetailDeviceId(null)}
                deviceId={detailDeviceId}
                routerId={selectedRouterId}
                onOpenWanConfig={(dev) => { setWanDevice(dev); setDetailDeviceId(null); }}
                onOpenWifiConfig={(dev) => { setWifiDevice(dev); setDetailDeviceId(null); }}
                onOpenRestore={(dev) => { setRestoreDevice(dev); setDetailDeviceId(null); }}
            />

            <PresetManagerModal
                isOpen={showPresetManager}
                onClose={() => setShowPresetManager(false)}
                selectedCount={selectedDeviceIds.length}
                onApply={selectedDeviceIds.length > 0 ? handleApplyPreset : undefined}
            />
        </div>
    );
}
