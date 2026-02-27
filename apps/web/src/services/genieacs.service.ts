import { apiClient } from '@/lib/api';

export const genieacsService = {
    /**
     * Get all devices
     */
    getDevices: async (routerId) => {
        const response = await apiClient.get('/genieacs/devices', {
            params: { routerId }
        });
        return response.data.data;
    },

    /**
     * Get device by ID
     */
    getDevice: async (id, routerId) => {
        const response = await apiClient.get(`/genieacs/devices/${id}`, {
            params: { routerId }
        });
        return response.data.data;
    },

    /**
     * Reboot device
     */
    rebootDevice: async (id, routerId) => {
        const response = await apiClient.post(`/genieacs/devices/${id}/reboot`, null, {
            params: { routerId }
        });
        return response.data;
    },

    /**
     * Update parameter
     */
    updateParameter: async (id, parameterName, value, type, routerId) => {
        const response = await apiClient.patch(`/genieacs/devices/${id}/parameters`, {
            parameterName,
            value,
            type
        }, {
            params: { routerId }
        });
        return response.data;
    },

    /**
     * Update WAN Configuration
     */
    updateWanConfig: async (id, config, routerId) => {
        const response = await apiClient.patch(`/genieacs/devices/${id}/wan-config`, config, {
            params: { routerId }
        });
        return response.data;
    },

    /**
     * Update WiFi Configuration
     */
    updateWifiConfig: async (id, config, routerId) => {
        const response = await apiClient.patch(`/genieacs/devices/${id}/wifi-config`, config, {
            params: { routerId }
        });
        return response.data;
    },

    /**
     * Refresh Device
     */
    refreshDevice: async (id, routerId) => {
        const response = await apiClient.post(`/genieacs/devices/${id}/refresh`, {}, {
            params: { routerId }
        });
        return response.data;
    },

    /**
     * Factory Reset
     */
    factoryReset: async (id, routerId) => {
        const response = await apiClient.post(`/genieacs/devices/${id}/factory-reset`, {}, {
            params: { routerId }
        });
        return response.data;
    },

    bulkReboot: async (deviceIds, routerId) => {
        const response = await apiClient.post('/genieacs/devices/bulk/reboot', { deviceIds }, {
            params: { routerId }
        });
        return response.data;
    },

    bulkPushConfig: async (deviceIds, type, config, routerId) => {
        const response = await apiClient.post('/genieacs/devices/bulk/config', {
            deviceIds,
            type,
            config
        }, {
            params: { routerId }
        });
        return response.data;
    },

    /**
     * Get dashboard statistics
     */
    getDashboardStats: async (routerId) => {
        const response = await apiClient.get('/genieacs-dashboard/stats', {
            params: { routerId }
        });
        return response.data.data;
    }
};
