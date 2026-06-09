import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
    useRouter,
    useRouterInterfaces,
    useRouterMetrics,
    useRouterNetwatch,
    useSettings,
    useSyncNetwatch,
    useRefreshRouter,
    useRealtimeTraffic
} from '@/hooks';
import { Button } from '@/components/ui/Button';
import {
    Zap,
    Eye,
    AlertCircle,
    History,
    Gauge as GaugeIcon,
    PhoneCall,
    Network,
    MapPin,
    RefreshCw,
    ArrowLeft,
    Clock,
    Edit,
    HardDrive,
    BarChart2,
    Terminal
} from 'lucide-react';
import clsx from 'clsx';

// Internal Components
import Tabs from '@/components/router/common/Tabs';
import EditRouterModal from '@/components/router/modals/EditRouterModal';
import DashboardTab from '@/components/router/tabs/DashboardTab';
import NetwatchTab from '@/components/router/tabs/NetwatchTab';
import PppoeTab from '@/components/router/tabs/PppoeTab';
import NeighborsTab from '@/components/router/tabs/NeighborsTab';
import HistoryTab from '@/components/router/tabs/HistoryTab';
import MapTab from '@/components/router/tabs/MapTab';
import BackupsTab from '@/components/router/tabs/BackupsTab';
import BandwidthTab from '@/components/router/tabs/BandwidthTab';
import MiniTopology from '@/components/router/MiniTopology';
import ToolsTab from '@/components/router/tabs/ToolsTab';

// Utils
import { formatLastSync } from '@/components/router/router-utils';

const EMPTY_ARRAY = [];

export default function RouterDetails() {
    const { id } = useParams();
    const [activeTab, setActiveTab] = useState('dashboard');
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);

    // SNMP Live Mode (WebSocket)
    const [isLiveMode, setIsLiveMode] = useState(false);
    const { traffic: realtimeTraffic, isConnected } = useRealtimeTraffic(id, isLiveMode);

    const { data: router, isLoading, error, refetch } = useRouter(id);
    const { data: apiInterfaces = EMPTY_ARRAY } = useRouterInterfaces(id);
    const { data: metrics } = useRouterMetrics(id);

    // Netwatch still polls every 30s to sync up/down status
    const { data: netwatch = EMPTY_ARRAY, refetch: refetchNetwatch } = useRouterNetwatch(id, {
        refetchInterval: 30000
    });

    const { data: settings } = useSettings();
    const syncMutation = useSyncNetwatch();
    const refreshMutation = useRefreshRouter();

    // Merge interfaces with Realtime WebSocket data if live mode is on
    const ifaceDescriptionMap = useMemo(() => {
        const map = {};
        if (apiInterfaces) {
            apiInterfaces.forEach(iface => {
                if (iface.name && iface.defaultName) {
                    map[iface.name] = iface.defaultName;
                }
            });
        }
        return map;
    }, [apiInterfaces]);

    const interfaces = useMemo(() => {
        if (!isLiveMode || !realtimeTraffic) return apiInterfaces;

        return apiInterfaces.map(iface => {
            const snmpStats =
                realtimeTraffic[iface.name] ||
                realtimeTraffic[iface.defaultName] ||
                realtimeTraffic[ifaceDescriptionMap[iface.name]];

            if (snmpStats) {
                return {
                    ...iface,
                    txRate: snmpStats.tx,
                    rxRate: snmpStats.rx,
                };
            }
            return iface;
        });
    }, [apiInterfaces, realtimeTraffic, isLiveMode, ifaceDescriptionMap]);

    const mergedNetwatch = useMemo(() => {
        if (!isLiveMode || !realtimeTraffic || !netwatch) return netwatch || [];

        return netwatch.map(nw => {
            const ifaceName = nw.targetInterface || nw.target_interface;

            if (ifaceName) {
                const stats =
                    realtimeTraffic[ifaceName] ||
                    Object.entries(realtimeTraffic).find(([key]) =>
                        key === ifaceName ||
                        key.split('-')[0] === ifaceName ||
                        ifaceName.split('-')[0] === key
                    )?.[1];

                if (stats) {
                    return {
                        ...nw,
                        txRate: stats.tx,
                        rxRate: stats.rx
                    };
                }
            }
            return nw;
        });
    }, [netwatch, realtimeTraffic, isLiveMode]);

    // Optimization: Throttled Netwatch for Map
    const [mapNetwatch, setMapNetwatch] = useState(mergedNetwatch);
    const lastMapUpdate = useRef(0);

    useEffect(() => {
        if (!isLiveMode) {
            if (mapNetwatch !== mergedNetwatch) {
                setMapNetwatch(mergedNetwatch);
            }
            return;
        }

        const now = Date.now();
        if ((now - lastMapUpdate.current) > 3000) {
            if (mapNetwatch !== mergedNetwatch) {
                setMapNetwatch(mergedNetwatch);
            }
            lastMapUpdate.current = now;
        }
    }, [mergedNetwatch, isLiveMode, mapNetwatch]);

    // Auto-sync netwatch every 30 seconds
    useEffect(() => {
        if (!id) return;
        syncMutation.mutate(id);
        const intervalId = setInterval(() => {
            syncMutation.mutate(id);
        }, 30000);
        return () => clearInterval(intervalId);
    }, [id]);

    const handleRefresh = async () => {
        try {
            await refreshMutation.mutateAsync(id);
        } catch (error) {
            console.error('Failed to refresh router:', error);
        }
    };

    const tabs = [
        { id: 'dashboard', label: 'Dashboard', icon: <GaugeIcon className="w-4 h-4" /> },
        { id: 'history', label: 'History', icon: <History className="w-4 h-4" /> },
        { id: 'netwatch', label: 'Netwatch', icon: <Eye className="w-4 h-4" /> },
        { id: 'pppoe', label: 'PPPoE', icon: <PhoneCall className="w-4 h-4" /> },
        { id: 'bandwidth', label: 'Bandwidth', icon: <BarChart2 className="w-4 h-4" /> },
        { id: 'neighbors', label: 'Neighbors', icon: <Network className="w-4 h-4" /> },
        { id: 'topology', label: 'Topology', icon: <Zap className="w-4 h-4" /> },
        { id: 'backups', label: 'Backups', icon: <HardDrive className="w-4 h-4" /> },
        { id: 'map', label: 'Map', icon: <MapPin className="w-4 h-4" /> },
        { id: 'tools', label: 'Tools', icon: <Terminal className="w-4 h-4" /> },
    ];

    if (isLoading) {
        return (
            <div className="flex-1 flex items-center justify-center bg-background-dark">
                <RefreshCw className="w-8 h-8 animate-spin text-primary" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center bg-background-dark gap-4">
                <AlertCircle className="w-12 h-12 text-red-500" />
                <p className="text-red-400">Failed to load router details</p>
                <Link to="/routers">
                    <Button variant="outline">Back to Devices</Button>
                </Link>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full bg-background-dark overflow-hidden">
            {/* Header */}
            <div className="p-3 sm:p-6 border-b border-slate-border">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-3 sm:mb-4 gap-3 sm:gap-4">
                    <div className="flex items-center gap-4">
                        <Link to="/routers">
                            <Button variant="ghost" size="icon">
                                <ArrowLeft className="w-5 h-5" />
                            </Button>
                        </Link>
                        <div>
                            <div className="flex items-center gap-3">
                                <h1 className="text-xl sm:text-2xl font-bold text-fg">{router?.name}</h1>
                                <span className={clsx(
                                    "px-2 py-0.5 rounded-full text-xs font-medium",
                                    router?.status === 'online'
                                        ? "bg-emerald-500/10 text-emerald-400"
                                        : "bg-red-500/10 text-red-400"
                                )}>
                                    {router?.status === 'online' ? 'Online' : 'Offline'}
                                </span>
                                {(router?.useSnmp ?? true) && (
                                    <span className={clsx(
                                        "px-2 py-0.5 rounded-full text-xs font-medium border",
                                        router?.snmpStatus === 'online'
                                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                                            : router?.snmpStatus === 'error'
                                                ? "bg-red-500/10 text-red-400 border-red-500/20"
                                                : "bg-slate-500/10 text-fg-muted border-slate-500/20"
                                    )}>
                                        SNMP: {router?.snmpStatus === 'online' ? 'OK' : (router?.snmpStatus === 'error' ? 'FAIL' : 'OFF')}
                                    </span>
                                )}
                            </div>
                            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 mt-1 text-sm text-fg-muted">
                                <div className="flex items-center gap-1.5">
                                    <MapPin className="w-3.5 h-3.5 text-fg-muted" />
                                    <span>{router?.host}:{router?.port}</span>
                                </div>
                                <div className="hidden sm:block w-1 h-1 rounded-full bg-slate-700"></div>
                                <div className="flex items-center gap-1.5 text-xs text-fg-muted">
                                    <Clock className="w-3.5 h-3.5" />
                                    <span>Last Sync: {formatLastSync(router?.lastSeen || router?.updatedAt)}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 w-full sm:w-auto">
                        {/* Live Mode Toggle */}
                        <div className="flex items-center gap-2 bg-slate-surface/50 rounded-lg px-3 py-1.5 border border-slate-700/50 mr-2">
                                <div className={clsx(
                                    "w-2 h-2 rounded-full animate-pulse",
                                    isLiveMode ? "bg-red-500" : "bg-slate-500"
                                )} />
                                <span className="text-xs font-medium text-fg">Live Mode</span>
                                <button
                                    onClick={() => setIsLiveMode(!isLiveMode)}
                                    className={clsx(
                                        "w-8 h-4 rounded-full transition-colors relative ml-1",
                                        isLiveMode ? "bg-red-500/20" : "bg-slate-700"
                                    )}
                                >
                                    <div className={clsx(
                                        "absolute top-0.5 w-3 h-3 rounded-full transition-all",
                                        isLiveMode ? "left-4.5 bg-red-500" : "left-0.5 bg-slate-400"
                                    )} />
                                </button>
                            </div>

                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleRefresh}
                            loading={refreshMutation.isPending}
                            className="flex-1 sm:flex-none"
                        >
                            <RefreshCw className="w-4 h-4 mr-2" />
                            Refresh
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setIsEditModalOpen(true)}
                            className="flex-1 sm:flex-none"
                        >
                            <Edit className="w-4 h-4 mr-2" />
                            Edit
                        </Button>
                    </div>
                </div>

                {/* Tabs */}
                <Tabs tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 custom-scrollbar">
                {activeTab === 'dashboard' && (
                    <DashboardTab router={router} metrics={metrics} interfaces={interfaces} />
                )}
                {activeTab === 'history' && (
                    <HistoryTab routerId={id} />
                )}
                {activeTab === 'netwatch' && (
                    <NetwatchTab routerId={id} netwatch={mergedNetwatch} onRefresh={refetchNetwatch} />
                )}
                {activeTab === 'pppoe' && (
                    <PppoeTab routerId={id} />
                )}
                {activeTab === 'bandwidth' && (
                    <BandwidthTab routerId={id} />
                )}
                {activeTab === 'neighbors' && (
                    <NeighborsTab routerId={id} />
                )}
                {activeTab === 'topology' && (
                    <MiniTopology routerId={id} />
                )}
                {activeTab === 'backups' && (
                    <BackupsTab routerId={id} />
                )}
                {activeTab === 'map' && (
                    <MapTab
                        router={router}
                        netwatch={mapNetwatch}
                        realtimeTraffic={realtimeTraffic}
                        isLiveMode={isLiveMode}
                    />
                )}
                {activeTab === 'tools' && (
                    <ToolsTab routerId={id} />
                )}
            </div>

            {/* Edit Modal */}
            <EditRouterModal
                isOpen={isEditModalOpen}
                onClose={() => setIsEditModalOpen(false)}
                onSuccess={() => {
                    refetch();
                    setIsEditModalOpen(false);
                }}
                router={router}
            />
        </div>
    );
}
