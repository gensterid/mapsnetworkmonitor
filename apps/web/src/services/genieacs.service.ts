import { apiClient } from '@/lib/api';

export const genieacsService = {
    /**
     * Get all devices
     */
    getDevices: async () => {
        const response = await apiClient.get('/genieacs/devices');
        return response.data.data;
    },

    /**
     * Get device by ID
     */
    getDevice: async (id) => {
        const response = await apiClient.get(`/genieacs/devices/${id}`);
        return response.data.data;
    },

    /**
     * Reboot device
     */
    rebootDevice: async (id) => {
        const response = await apiClient.post(`/genieacs/devices/${id}/reboot`);
        return response.data.data;
    }
};
