import { get, post, patch } from '@/lib/api';

export const genieacsService = {
    /**
     * Get all devices
     */
    getDevices: (routerId) => get('/genieacs/devices', { params: { routerId } }),

    /**
     * Get device by ID
     */
    getDevice: (id, routerId) => get(`/genieacs/devices/${id}`, { params: { routerId } }),

    /**
     * Reboot device
     */
    rebootDevice: (id, routerId) => post(`/genieacs/devices/${id}/reboot`, null, { params: { routerId } }),

    /**
     * Update parameter
     */
    updateParameter: (id, parameterName, value, type, routerId) => 
        patch(`/genieacs/devices/${id}/parameters`, { parameterName, value, type }, { params: { routerId } }),

    /**
     * Update WAN Configuration
     */
    updateWanConfig: (id, config, routerId) => 
        patch(`/genieacs/devices/${id}/wan-config`, config, { params: { routerId } }),

    /**
     * Update WiFi Configuration
     */
    updateWifiConfig: (id, config, routerId) => 
        patch(`/genieacs/devices/${id}/wifi-config`, config, { params: { routerId } }),

    /**
     * Refresh Device
     */
    refreshDevice: (id, routerId) => post(`/genieacs/devices/${id}/refresh`, {}, { params: { routerId } }),

    /**
     * Factory Reset
     */
    factoryReset: (id, routerId) => post(`/genieacs/devices/${id}/factory-reset`, {}, { params: { routerId } }),

    bulkReboot: (deviceIds, routerId) => post('/genieacs/devices/bulk/reboot', { deviceIds }, { params: { routerId } }),

    bulkPushConfig: (deviceIds, type, config, routerId) => 
        post('/genieacs/devices/bulk/config', { deviceIds, type, config }, { params: { routerId } }),

    /**
     * Get dashboard statistics
     */
    getDashboardStats: (routerId) => get('/genieacs-dashboard/stats', { params: { routerId } }),
};
