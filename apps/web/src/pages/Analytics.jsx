import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import apiClient from '@/lib/api/client';
import { useRouters } from '@/hooks';
import { Button } from '@/components/ui/Button';
import {
    BarChart3,
    RefreshCw,
    Calendar,
    RotateCcw
} from 'lucide-react';
import clsx from 'clsx';
import AnalyticsDetailModal from '@/components/analytics/AnalyticsDetailModal';

// Modular Components
import RouterSelector from '@/components/analytics/RouterSelector';
import DateRangePicker from '@/components/analytics/DateRangePicker';
import AnalyticsOverview from '@/components/analytics/AnalyticsOverview';
import AnalyticsTrends from '@/components/analytics/AnalyticsTrends';
import AnalyticsAlertsList from '@/components/analytics/AnalyticsAlertsList';
import AnalyticsDetails from '@/components/analytics/AnalyticsDetails';
import AnalyticsHistory from '@/components/analytics/AnalyticsHistory';
import AnalyticsAdvanced from '@/components/analytics/AnalyticsAdvanced';
import AnalyticsStatModals from '@/components/analytics/AnalyticsStatModals';



export default function Analytics() {
    // Get routers list (respects user role permissions via the hook)
    const { data: routers = [] } = useRouters();

    // Selected router filter
    const [selectedRouterId, setSelectedRouterId] = useState(null);

    // Detail modal state for stat cards
    const [detailModal, setDetailModal] = useState({ open: false, type: null, title: '', data: null });

    // History/Detail modal for list items
    const [historyModal, setHistoryModal] = useState({ open: false, type: null, target: null });

    // Target Sub-filters
    const [selectedInterfaceId, setSelectedInterfaceId] = useState(null);
    const [selectedHost, setSelectedHost] = useState(null);
    const [selectedOnuId, setSelectedOnuId] = useState(null);

    // Helper to get default date range (30 days)
    const getDefaultDateRange = () => {
        const end = new Date();
        const start = new Date();
        start.setDate(start.getDate() - 30);
        return {
            startDate: start.toISOString().split('T')[0],
            endDate: end.toISOString().split('T')[0],
            label: '30 Hari',
        };
    };

    // Default to last 30 days
    const [dateRange, setDateRange] = useState(getDefaultDateRange);

    // Check if viewing single day (from chart click)
    const isSingleDayView = dateRange.startDate === dateRange.endDate;

    // Build query params - for single day, ensure we capture the full day
    const queryParams = useMemo(() => {
        let startDateParam = dateRange.startDate;
        let endDateParam = dateRange.endDate;

        // For single day view, set proper time range to capture full day
        if (isSingleDayView && dateRange.startDate) {
            startDateParam = `${dateRange.startDate}T00:00:00`;
            endDateParam = `${dateRange.endDate}T23:59:59`;
        }

        // For multi-day view, also ensure we capture the full end day
        if (endDateParam && !endDateParam.includes('T')) {
            endDateParam = `${endDateParam}T23:59:59`;
        }

        return {
            startDate: startDateParam,
            endDate: endDateParam,
            ...(selectedRouterId && { routerId: selectedRouterId }),
        };
    }, [dateRange.startDate, dateRange.endDate, selectedRouterId, isSingleDayView]);

    // API Queries
    const { data: overview, isLoading: overviewLoading, refetch: refetchOverview } = useQuery({
        queryKey: ['analytics-overview', queryParams],
        queryFn: async () => {
            const res = await apiClient.get('/analytics/overview', { params: queryParams });
            return res.data.data;
        },
    });

    const { data: alertTrends, isLoading: trendsLoading } = useQuery({
        queryKey: ['analytics-alert-trends', queryParams],
        queryFn: async () => {
            const res = await apiClient.get('/analytics/alerts/trends', { params: queryParams });
            return res.data.data;
        },
    });


    const { data: uptimeStats, isLoading: uptimeLoading } = useQuery({
        queryKey: ['analytics-uptime', queryParams],
        queryFn: async () => {
            const res = await apiClient.get('/analytics/uptime', { params: queryParams });
            return res.data.data;
        },
    });

    const { data: performance, isLoading: perfLoading } = useQuery({
        queryKey: ['analytics-performance', queryParams],
        queryFn: async () => {
            const res = await apiClient.get('/analytics/performance', { params: queryParams });
            return res.data.data;
        },
    });

    const { data: topDownDevices } = useQuery({
        queryKey: ['analytics-top-down', queryParams],
        queryFn: async () => {
            const res = await apiClient.get('/analytics/top-down-devices', { params: queryParams });
            return res.data.data;
        },
    });

    const { data: issuesAnalysis, isLoading: issuesAnalysisLoading } = useQuery({
        queryKey: ['analytics-issues-analysis', queryParams],
        queryFn: async () => {
            const res = await apiClient.get('/analytics/issues', { params: queryParams });
            return res.data.data;
        },
    });

    // PPPoE Top Disconnectors query
    const { data: pppoeDisconnectors } = useQuery({
        queryKey: ['analytics-pppoe-disconnectors', queryParams],
        queryFn: async () => {
            const res = await apiClient.get('/analytics/pppoe/top-disconnectors', { params: queryParams });
            return res.data.data;
        },
    });

    // PPPoE Down Status query
    const { data: pppoeDownStatus } = useQuery({
        queryKey: ['analytics-pppoe-down-status', queryParams],
        queryFn: async () => {
            const res = await apiClient.get('/analytics/pppoe/down-status', { params: queryParams });
            return res.data.data;
        },
    });

    // Advanced Analytics Queries
    const { data: cpuPeaks, isLoading: cpuPeaksLoading } = useQuery({
        queryKey: ['analytics-cpu-peaks', queryParams],
        queryFn: async () => {
            const res = await apiClient.get('/analytics/cpu-peaks', { params: queryParams });
            return res.data.data;
        },
    });

    const { data: downtimeAnalysis, isLoading: downtimeLoading } = useQuery({
        queryKey: ['analytics-downtime', queryParams],
        queryFn: async () => {
            const res = await apiClient.get('/analytics/downtime', { params: { ...queryParams, minMinutes: 5 } });
            return res.data.data;
        },
    });

    const { data: capacityAnalysis, isLoading: capacityLoading } = useQuery({
        queryKey: ['analytics-capacity', queryParams],
        queryFn: async () => {
            const res = await apiClient.get('/analytics/capacity', { params: queryParams });
            return res.data.data;
        },
    });

    const { data: incidentHeatmap, isLoading: heatmapLoading } = useQuery({
        queryKey: ['analytics-incident-heatmap', queryParams],
        queryFn: async () => {
            const res = await apiClient.get('/analytics/incident-heatmap', { params: queryParams });
            return res.data.data;
        },
    });

    const { data: resolutionStats, isLoading: resolutionLoading } = useQuery({
        queryKey: ['analytics-resolution', queryParams],
        queryFn: async () => {
            const res = await apiClient.get('/analytics/resolution', { params: queryParams });
            return res.data.data;
        },
    });

    // --- Detail Metrics History Options ---
    const { data: interfaces = [] } = useQuery({
        queryKey: ['router-interfaces', selectedRouterId],
        queryFn: async () => {
            if (!selectedRouterId) return [];
            const res = await apiClient.get(`/routers/${selectedRouterId}/interfaces`);
            return res.data.data;
        },
        enabled: !!selectedRouterId
    });

    const { data: netwatch = [] } = useQuery({
        queryKey: ['router-netwatch', selectedRouterId],
        queryFn: async () => {
            if (!selectedRouterId) return [];
            const res = await apiClient.get(`/routers/${selectedRouterId}/netwatch`);
            return res.data.data;
        },
        enabled: !!selectedRouterId
    });

    const { data: onus = [] } = useQuery({
        queryKey: ['router-onus', selectedRouterId],
        queryFn: async () => {
            if (!selectedRouterId) return [];
            const res = await apiClient.get(`/olts/onus/by-router/${selectedRouterId}`);
            return res.data.data;
        },
        enabled: !!selectedRouterId
    });

    // --- Detail Metrics Trends ---
    const { data: interfaceHistory, isLoading: interfaceHistoryLoading } = useQuery({
        queryKey: ['analytics-interface-history', selectedInterfaceId, queryParams],
        queryFn: async () => {
            if (!selectedInterfaceId) return [];
            const res = await apiClient.get('/analytics/performance/interface', { 
                params: { ...queryParams, interfaceId: selectedInterfaceId } 
            });
            return res.data.data;
        },
        enabled: !!selectedInterfaceId
    });

    const { data: latencyHistory, isLoading: latencyHistoryLoading } = useQuery({
        queryKey: ['analytics-latency-history', selectedHost, queryParams],
        queryFn: async () => {
            if (!selectedHost) return [];
            const res = await apiClient.get('/analytics/performance/device', { 
                params: { ...queryParams, host: selectedHost } 
            });
            return res.data.data;
        },
        enabled: !!selectedHost
    });

    const { data: onuHistory, isLoading: onuHistoryLoading } = useQuery({
        queryKey: ['analytics-onu-history', selectedOnuId, queryParams],
        queryFn: async () => {
            if (!selectedOnuId) return [];
            const res = await apiClient.get('/analytics/performance/device', { 
                params: { ...queryParams, onuId: selectedOnuId } 
            });
            return res.data.data;
        },
        enabled: !!selectedOnuId
    });

    // Alerts list query - for showing detailed alerts in single day view
    const { data: alertsList, isLoading: alertsListLoading } = useQuery({
        queryKey: ['analytics-alerts-list', queryParams],
        queryFn: async () => {
            const res = await apiClient.get('/analytics/alerts/list', { params: { ...queryParams, limit: 50 } });
            return res.data.data;
        },
        enabled: isSingleDayView, // Only fetch when viewing single day
    });

    const handleRefresh = () => {
        refetchOverview();
    };

    // Click on bar chart = filter ALL data to that single day
    const handleBarClick = (data) => {
        if (data?.date) {
            const clickedDate = data.date;
            setDateRange({
                startDate: clickedDate,
                endDate: clickedDate,
                label: new Date(clickedDate).toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
            });
        }
    };

    // Reset to default 30 days view
    const handleResetDateRange = () => {
        setDateRange(getDefaultDateRange());
    };

    const isLoading = overviewLoading || trendsLoading || uptimeLoading || perfLoading;

    return (
        <main className="flex flex-col h-full bg-background-dark overflow-hidden" aria-label="Analytics Dashboard">
            <div className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
                <div className="max-w-[1600px] mx-auto flex flex-col gap-6">
                    {/* Header */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div>
                            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                                <BarChart3 className="w-7 h-7 text-primary" />
                                Analytics Dashboard
                            </h1>
                            <p className="text-slate-400 text-sm mt-1">
                                Statistik dan analisis data monitoring jaringan
                            </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <RouterSelector routers={routers} value={selectedRouterId} onChange={setSelectedRouterId} />
                            <DateRangePicker value={dateRange} onChange={setDateRange} />
                            {isSingleDayView && (
                                <Button variant="outline" size="sm" onClick={handleResetDateRange} className="text-amber-400 border-amber-500/50 hover:bg-amber-500/10">
                                    <RotateCcw className="w-4 h-4 mr-1" />
                                    Reset
                                </Button>
                            )}
                            <Button variant="outline" size="sm" onClick={handleRefresh}>
                                <RefreshCw className={clsx("w-4 h-4", isLoading && "animate-spin")} />
                            </Button>
                        </div>
                    </div>

                    <section aria-labelledby="overview-heading">
                        <h2 id="overview-heading" className="sr-only">Ringkasan Statistik</h2>
                        <AnalyticsOverview 
                            overview={overview}
                            routers={routers}
                            pppoeDownStatus={pppoeDownStatus}
                            pppoeDisconnectors={pppoeDisconnectors}
                            setDetailModal={setDetailModal}
                            setHistoryModal={setHistoryModal}
                            loading={overviewLoading}
                        />
                    </section>

                    <section aria-labelledby="trends-heading">
                        <h2 id="trends-heading" className="sr-only">Tren Alerts dan Performa</h2>
                        <AnalyticsTrends 
                            trendsLoading={trendsLoading}
                            alertTrends={alertTrends}
                            handleBarClick={handleBarClick}
                            perfLoading={perfLoading}
                            performance={performance}
                        />
                    </section>

                    <AnalyticsAlertsList 
                        isSingleDayView={isSingleDayView}
                        dateRange={dateRange}
                        alertsListLoading={alertsListLoading}
                        alertsList={alertsList}
                    />

                    <section aria-labelledby="details-heading">
                        <h2 id="details-heading" className="sr-only">Analisis Detail</h2>
                        <AnalyticsDetails 
                            topDownDevices={topDownDevices}
                            topDownLoading={overviewLoading} 
                            uptimeStats={uptimeStats}
                            uptimeLoading={uptimeLoading}
                            issuesAnalysis={issuesAnalysis}
                            issuesAnalysisLoading={issuesAnalysisLoading}
                            resolutionStats={resolutionStats}
                            resolutionLoading={resolutionLoading}
                            pppoeDisconnectors={pppoeDisconnectors}
                            pppoeLoading={overviewLoading}
                            pppoeDownStatus={pppoeDownStatus}
                            setHistoryModal={setHistoryModal}
                        />
                    </section>

                    <AnalyticsHistory 
                        selectedRouterId={selectedRouterId}
                        selectedInterfaceId={selectedInterfaceId}
                        setSelectedInterfaceId={setSelectedInterfaceId}
                        interfaces={interfaces}
                        interfaceHistoryLoading={interfaceHistoryLoading}
                        interfaceHistory={interfaceHistory}
                        selectedHost={selectedHost}
                        setSelectedHost={setSelectedHost}
                        netwatch={netwatch}
                        latencyHistoryLoading={latencyHistoryLoading}
                        latencyHistory={latencyHistory}
                        selectedOnuId={selectedOnuId}
                        setSelectedOnuId={setSelectedOnuId}
                        onus={onus}
                        onuHistoryLoading={onuHistoryLoading}
                        onuHistory={onuHistory}
                    />

                    <AnalyticsAdvanced 
                        cpuPeaksLoading={cpuPeaksLoading}
                        cpuPeaks={cpuPeaks}
                        downtimeLoading={downtimeLoading}
                        downtimeAnalysis={downtimeAnalysis}
                        capacityLoading={capacityLoading}
                        capacityAnalysis={capacityAnalysis}
                        incidentHeatmap={incidentHeatmap}
                        heatmapLoading={heatmapLoading}
                        setHistoryModal={setHistoryModal}
                    />
                </div>
            </div>

            <AnalyticsStatModals 
                detailModal={detailModal}
                setDetailModal={setDetailModal}
            />

            <AnalyticsDetailModal
                open={historyModal.open}
                type={historyModal.type}
                target={historyModal.target}
                onClose={() => setHistoryModal({ open: false, type: null, target: null })}
            />
        </main>
    );
}
