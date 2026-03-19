import React from 'react';
import StatCard from './StatCard';
import { AlertTriangle, Activity, Server, Users, Wifi, WifiOff } from 'lucide-react';

function AnalyticsOverview({ 
    overview, 
    routers, 
    pppoeDownStatus, 
    pppoeDisconnectors, 
    setDetailModal, 
    setHistoryModal,
    loading = false
}) {
    return (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <StatCard
                loading={loading}
                Icon={AlertTriangle}
                label="Total Alerts"
                value={overview?.totalAlerts || 0}
                subvalue={`${overview?.unresolvedAlerts || 0} unresolved`}
                color="warning"
                onClick={() => setHistoryModal({
                    open: true,
                    type: 'unresolved-alerts',
                    target: { unresolved: overview?.unresolvedAlerts }
                })}
            />
            <StatCard
                loading={loading}
                Icon={Activity}
                label="Uptime Rata-rata"
                value={`${overview?.averageUptime || 0}%`}
                subvalue={`${overview?.onlineRouters || 0}/${overview?.totalRouters || 0} online`}
                color="success"
                onClick={() => setDetailModal({
                    open: true,
                    type: 'uptime',
                    title: 'Uptime Rata-rata',
                    data: { uptime: overview?.averageUptime, online: overview?.onlineRouters, total: overview?.totalRouters }
                })}
            />
            <StatCard
                loading={loading}
                Icon={Server}
                label="Total Routers"
                value={overview?.totalRouters || 0}
                subvalue={`${overview?.offlineRouters || 0} offline`}
                color="primary"
                onClick={() => setDetailModal({
                    open: true,
                    type: 'routers',
                    title: 'Detail Routers',
                    data: { total: overview?.totalRouters, online: overview?.onlineRouters, offline: overview?.offlineRouters, routers }
                })}
            />
            <StatCard
                loading={loading}
                Icon={Users}
                label="Total Devices"
                value={overview?.totalDevices || 0}
                subvalue="Netwatch hosts"
                color="primary"
                onClick={() => setDetailModal({
                    open: true,
                    type: 'devices',
                    title: 'Total Devices',
                    data: { total: overview?.totalDevices }
                })}
            />
            <StatCard
                loading={loading}
                Icon={Wifi}
                label="PPPoE Connect"
                value={overview?.pppoeConnects || 0}
                subvalue="Koneksi baru"
                color="success"
                onClick={() => setDetailModal({
                    open: true,
                    type: 'pppoe-connect',
                    title: 'PPPoE Connections',
                    data: {
                        connects: overview?.pppoeConnects,
                        downStatus: pppoeDownStatus
                    }
                })}
            />
            <StatCard
                loading={loading}
                Icon={WifiOff}
                label="PPPoE Disconnect"
                value={overview?.pppoeDisconnects || 0}
                subvalue="Terputus"
                color="danger"
                onClick={() => setDetailModal({
                    open: true,
                    type: 'pppoe-disconnect',
                    title: 'PPPoE Disconnections',
                    data: {
                        disconnects: overview?.pppoeDisconnects,
                        disconnectors: pppoeDisconnectors,
                        downStatus: pppoeDownStatus
                    }
                })}
            />
        </div>
    );
}

export default AnalyticsOverview;
