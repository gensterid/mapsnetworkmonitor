import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { genieacsService } from '../services/genieacs.service';
import toast from 'react-hot-toast';

export function useGenieACSDevices(routerId, options = {}) {
    return useQuery({
        queryKey: ['genieacs-devices', routerId],
        queryFn: () => genieacsService.getDevices(routerId),
        refetchInterval: options.refetchInterval || false,
        refetchIntervalInBackground: true,
        staleTime: 30 * 1000, // 30 seconds
        gcTime: 5 * 60 * 1000, // 5 minutes
        placeholderData: (previousData) => previousData,
        ...options
    });
}

export function useGenieACSDevice(id, routerId) {
    return useQuery({
        queryKey: ['genieacs-devices', id, routerId],
        queryFn: () => genieacsService.getDevice(id, routerId),
        enabled: !!id,
    });
}

export function useRebootGenieACSDevice() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, routerId }) => genieacsService.rebootDevice(id, routerId),
        onSuccess: (_, { routerId }) => {
            toast.success('Device reboot command sent');
            queryClient.invalidateQueries({ queryKey: ['genieacs-devices', routerId] });
        },
        onError: (error) => {
            toast.error(error.response?.data?.error || 'Failed to reboot device');
        },
    });
}

export function useUpdateGenieACSParameter() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, parameterName, value, type, routerId }) =>
            genieacsService.updateParameter(id, parameterName, value, type, routerId),
        onSuccess: (_, { routerId }) => {
            toast.success('Parameter update task created');
            queryClient.invalidateQueries({ queryKey: ['genieacs-devices', routerId] });
        },
        onError: (error) => {
            toast.error(error.response?.data?.error || 'Failed to update parameter');
        },
    });
}

export function useUpdateGenieACSWanConfig() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, config, routerId }) =>
            genieacsService.updateWanConfig(id, config, routerId),
        onSuccess: (_, { routerId }) => {
            toast.success('WAN configuration task created');
            queryClient.invalidateQueries({ queryKey: ['genieacs-devices', routerId] });
        },
        onError: (error) => {
            toast.error(error.response?.data?.error || 'Failed to update WAN configuration');
        },
    });
}

export function useUpdateGenieACSWifiConfig() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, config, routerId }) => genieacsService.updateWifiConfig(id, config, routerId),
        onSuccess: async (data, { id, routerId }) => {
            toast.success('WiFi Configuration task queued');
            
            // Fix invalidation keys to match useGenieACSDevice
            queryClient.invalidateQueries({ queryKey: ['genieacs-devices', id, routerId] });
            
            if (routerId) {
                queryClient.invalidateQueries({ queryKey: ['genieacs-devices', routerId] });
            }

            // Proactively trigger a refresh (Summon) after a short delay
            // to pull the new state from the ONT back to ACS
            try {
                setTimeout(async () => {
                    await genieacsService.refreshDevice(id, routerId);
                    queryClient.invalidateQueries({ queryKey: ['genieacs-devices', id, routerId] });
                }, 3000);
            } catch (e) {
                console.error("Post-update refresh failed", e);
            }
        },
        onError: (error) => {
            toast.error(error.response?.data?.error || error.message || 'Failed to update WiFi config');
        }
    });
}

export function useRefreshGenieACSDevice() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, routerId }) => genieacsService.refreshDevice(id, routerId),
        onSuccess: (_, { routerId }) => {
            toast.success('Refresh command sent (Summon)');
        },
        onError: (error) => {
            toast.error(error.response?.data?.error || 'Failed to refresh device');
        },
    });
}

export function useFactoryResetGenieACSDevice() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, routerId }) => genieacsService.factoryReset(id, routerId),
        onSuccess: (_, { routerId }) => {
            toast.success('Factory Reset command sent');
            queryClient.invalidateQueries({ queryKey: ['genieacs-devices', routerId] });
        },
        onError: (error) => {
            toast.error(error.response?.data?.error || 'Failed to factory reset device');
        },
    });
}

export function useBulkRebootGenieAcs() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ deviceIds, routerId }) => genieacsService.bulkReboot(deviceIds, routerId),
        onSuccess: (data, { routerId }) => {
            const { success, failed } = data;
            if (failed > 0) {
                toast.success(`Reboot command sent: ${success} successful, ${failed} failed`);
            } else {
                toast.success(`Reboot command sent to ${success} devices`);
            }
            queryClient.invalidateQueries({ queryKey: ['genieacs-devices', routerId] });
        },
        onError: (error) => {
            toast.error(error.response?.data?.error || 'Failed to bulk reboot devices');
        },
    });
}

export function useBulkPushConfigGenieAcs() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ deviceIds, type, config, routerId }) => genieacsService.bulkPushConfig(deviceIds, type, config, routerId),
        onSuccess: (data, { routerId }) => {
            const { success, failed } = data;
            if (failed > 0) {
                toast.success(`Config push task created: ${success} successful, ${failed} failed`);
            } else {
                toast.success(`Config push task created for ${success} devices`);
            }
            queryClient.invalidateQueries({ queryKey: ['genieacs-devices', routerId] });
        },
        onError: (error) => {
            toast.error(error.response?.data?.error || 'Failed to bulk push config');
        },
    });
}

export function useGenieACSDashboardStats(routerId) {
    return useQuery({
        queryKey: ['genieacs-dashboard-stats', routerId],
        queryFn: () => genieacsService.getDashboardStats(routerId),
        refetchInterval: 30 * 1000, // Refresh every 30 seconds
    });
}

export function useGenieACSBackups(id, routerId) {
    return useQuery({
        queryKey: ['genieacs-backups', id],
        queryFn: () => genieacsService.getBackups(id, routerId),
        enabled: !!id,
    });
}

export function useCreateGenieACSBackup() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, name, routerId }) => genieacsService.createBackup(id, name, routerId),
        onSuccess: (_, { id }) => {
            toast.success('Backup created successfully');
            queryClient.invalidateQueries({ queryKey: ['genieacs-backups', id] });
        },
        onError: (error) => {
            toast.error(error.response?.data?.error || 'Failed to create backup');
        },
    });
}

export function useDeleteGenieACSBackup() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, backupId, routerId }) => genieacsService.deleteBackup(id, backupId, routerId),
        onSuccess: (_, { id }) => {
            toast.success('Backup deleted successfully');
            queryClient.invalidateQueries({ queryKey: ['genieacs-backups', id] });
        },
        onError: (error) => {
            toast.error(error.response?.data?.error || 'Failed to delete backup');
        },
    });
}

export function useRestoreGenieACSAuto() {
    const queryClient = useQueryClient();
    return useMutation({
        onSuccess: (_, { id, routerId }) => {
            toast.success('Auto restore command sent');
            // Proactive refresh to make device pick up tasks immediately
            setTimeout(() => {
                genieacsService.refreshDevice(id, routerId).catch(() => {});
            }, 1000);
            queryClient.invalidateQueries({ queryKey: ['genieacs-devices', id, routerId] });
        },
        onError: (error) => {
            toast.error(error.response?.data?.error || 'Failed to restore configuration');
        },
    });
}

export function useRestoreGenieACSManual() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, config, routerId }) => genieacsService.restoreManual(id, config, routerId),
        onSuccess: (_, { id, routerId }) => {
            toast.success('Manual restore command sent');
            queryClient.invalidateQueries({ queryKey: ['genieacs-devices', id, routerId] });
        },
        onError: (error) => {
            toast.error(error.response?.data?.error || 'Failed to restore configuration');
        },
    });
}

export function useDeleteGenieACSWanConfig() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, connectionPath, routerId }) => genieacsService.deleteWanConfig(id, connectionPath, routerId),
        onSuccess: (_, { id, routerId }) => {
            toast.success('WAN connection deletion task created');
            queryClient.invalidateQueries({ queryKey: ['genieacs-devices', id, routerId] });
        },
        onError: (error) => {
            toast.error(error.response?.data?.error || 'Failed to delete WAN configuration');
        },
    });
}

export function useUpdateGenieACSSettings() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, settings, routerId }) => genieacsService.updateAcsSettings(id, settings, routerId),
        onSuccess: (_, { id, routerId }) => {
            toast.success('ACS settings update task created');
            queryClient.invalidateQueries({ queryKey: ['genieacs-devices', id, routerId] });
        },
        onError: (error) => {
            toast.error(error.response?.data?.error || 'Failed to update ACS settings');
        },
    });
}
