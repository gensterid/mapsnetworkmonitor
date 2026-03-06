import apiClient from '../client';

export const analyticsService = {
    /**
     * Get alert trends
     * @param {Object} params { startDate, endDate, routerId }
     */
    getAlertTrends: async (params) => {
        const res = await apiClient.get('/analytics/alerts/trends', { params });
        return res.data.data;
    },

    /**
     * Get performance trends (CPU/Memory)
     * @param {Object} params { startDate, endDate, routerId }
     */
    getPerformanceTrends: async (params) => {
        const res = await apiClient.get('/analytics/performance', { params });
        return res.data.data;
    },

    /**
     * Get device-specific performance trends (Latency & Signal)
     * @param {Object} params { routerId, host, onuId, startDate, endDate }
     */
    getDevicePerformanceTrends: async (params) => {
        const res = await apiClient.get('/analytics/performance/device', { params });
        return res.data.data;
    },

    /**
     * Get uptime statistics
     * @param {Object} params { startDate, endDate, routerId }
     */
    getUptimeStats: async (params) => {
        const res = await apiClient.get('/analytics/uptime', { params });
        return res.data.data;
    },

    /**
     * Get audit logs
     * @param {Object} params { page, limit, startDate, endDate, action, entity }
     */
    getAuditLogs: async (params) => {
        const res = await apiClient.get('/analytics/audit-logs', { params });
        return res.data.data;
    }
};

export default analyticsService;
