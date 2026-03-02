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

// Group hooks
export {
    useGroups,
    useGroup,
    useCreateGroup,
    useUpdateGroup,
    useDeleteGroup,
    groupKeys,
} from './useGroups';

// Settings hooks
export {
    useSettings,
    useSettingsList,
    useSetting,
    useAuditLogs,
    useUpdateSetting,
    useDeleteSetting,
    settingsKeys,
} from './useSettings';

// SSE (Server-Sent Events) hook
export { useSSE } from './useSSE';
// export * from './usePppoe'; // Skipped for now
export * from './useOlts';
export * from './useGenieACS';
export * from './useBackup';
export * from './useSocket';
export * from './useAI';
export * from './usePresets';
export * from './useTenants';
// Utility hooks
export { useDebounce } from './useDebounce';
export { useAppTimezone } from './useAppTimezone';
export { useRealtimeTraffic, useAllRoutersTraffic } from './useSocket';
