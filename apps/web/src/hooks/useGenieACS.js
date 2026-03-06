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
        mutationFn: async ({ id, config, routerId }) => {
            const { data } = await genieacsService.updateWifiConfig(id, config, routerId);
            return data;
        },
        onSuccess: (_, { id, routerId }) => {
            toast.success('WiFi Configuration task queued');
            queryClient.invalidateQueries(['genieacs-device', id]);
            if (routerId) {
                queryClient.invalidateQueries(['genieacs-devices', routerId]);
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
            const { success, failed } = data.data;
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
            const { success, failed } = data.data;
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
