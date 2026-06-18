// Router hooks
export {
    useRouters,
    useRouter,
    useRouterInterfaces,
    useRouterMetrics,
    useRouterMetricsHistory,
    useRouterNetwatch,
    useCreateRouter,
    useUpdateRouter,
    useDeleteRouter,
    useTestConnection,
    useTestConnectionWithCredentials,
    useRefreshRouter,
    useRebootRouter,
    useRouterNeighbors,
    useRouterRomonNeighbors,
    useCreateNetwatch,
    useUpdateNetwatch,
    useDeleteNetwatch,
    useSyncNetwatch,
    useRouterHotspotActive,
    useRouterPppActive,
    useRouterPppSessions,
    usePppoeSessions,
    useUpdatePppoeCoordinates,
    useRouterTopology,
    useUpdateTopologyCoords,
    useAddTopologyNode,
    useUpdateTopologyNode,
    useRemoveTopologyNode,
    useAddTopologyLink,
    useUpdateTopologyLink,
    useRemoveTopologyLink,
    usePingLatencies,
    useSnmpTraffic,
    usePingHost,
    routerKeys,
} from './useRouters';

// User hooks
export {
    useUsers,
    useUser,
    useCurrentUser,
    useCreateUser,
    useUpdateUser,
    useUpdateUserRole,
    useUpdateUserPassword,
    useDeleteUser,
    userKeys,
} from './useUsers';

// Alert hooks
export {
    useAlerts,
    useAlert,
    useUnreadAlertCount,
    useUnacknowledgedAlerts,
    useAcknowledgeAlert,
    useAcknowledgeAllAlerts,
    useResolveAlert,
    useResolveAllAlerts,
    useDeleteAlert,
    alertKeys,
} from './useAlerts';

// Settings hooks
export {
    useSettings,
    useSettingsList,
    useSetting,
    useAuditLogs,
    useUpdateSetting,
    useDeleteSetting,
    useDatabaseStats,
    settingsKeys,
} from './useSettings';

// Netwatch hooks
export { useNetwatchConflicts, useResolveConflicts } from './useNetwatchConflicts';
export { useNetwatchHistory, useHealNetwatchNow } from './useNetwatchHistory';

// SSE (Server-Sent Events) hook
export { useSSE } from './useSSE';
// export * from './usePppoe'; // Skipped for now
export * from './useOlts';
export * from './useGenieACS';
export * from './useBackup';
// `useSocket` star export dihapus — redundant dengan explicit named export
// `useRealtimeTraffic, useAllRoutersTraffic` di bawah. Hook getSocket dipakai
// internal di useSocket.js saja, tidak perlu di-bundle ke @/hooks.
export * from './useAI';
export * from './useBandwidth';
export * from './useBilling';
export * from './usePresets';
export * from './useTenants';
// Analytics hooks
export * from './useAnalytics';

// Utility hooks
export { useDebounce } from './useDebounce';
export { useAppTimezone } from './useAppTimezone';
export { useDashboardStats, useDownItems } from './useDashboard';
export { useRealtimeTraffic, useAllRoutersTraffic } from './useSocket';
