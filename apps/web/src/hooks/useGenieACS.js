import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { genieacsService } from '../services/genieacs.service';
import toast from 'react-hot-toast';

export function useGenieACSDevices() {
    return useQuery({
        queryKey: ['genieacs-devices'],
        queryFn: genieacsService.getDevices,
    });
}

export function useGenieACSDevice(id) {
    return useQuery({
        queryKey: ['genieacs-devices', id],
        queryFn: () => genieacsService.getDevice(id),
        enabled: !!id,
    });
}

export function useRebootGenieACSDevice() {
    return useMutation({
        mutationFn: genieacsService.rebootDevice,
        onSuccess: () => {
            toast.success('Device reboot command sent');
        },
        onError: (error) => {
            toast.error(error.response?.data?.error || 'Failed to reboot device');
        },
    });
}
