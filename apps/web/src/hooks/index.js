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
    useCreateNetwatch,
    useUpdateNetwatch,
    useDeleteNetwatch,
    useSyncNetwatch,
    useRouterHotspotActive,
    useRouterPppActive,
    usePingLatencies,
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
export * from './useBackup';
