import { get, put, del } from '../client';

/**
 * Alert Service
 * Handles all alert-related API calls
 */
export const alertService = {
    /**
     * Get all alerts
     * params: { page, limit, sortOrder }
     */
    getAll: (params = {}) => {
        const queryParams = new URLSearchParams();
        if (params.page) queryParams.append('page', params.page);
        if (params.limit) queryParams.append('limit', params.limit);
        if (params.sortOrder) queryParams.append('sortOrder', params.sortOrder);

        // Handle legacy limit-only call if someone passes a number
        if (typeof params === 'number') {
            return get(`/alerts?limit=${params}`);
        }

        return get(`/alerts?${queryParams.toString()}`);
    },

    /**
     * Get alert by ID
     */
    getById: (id) => get(`/alerts/${id}`),

    /**
     * Get unread alert count and statistics
     */
    getUnreadCount: () => get('/alerts/unread'),

    /**
     * Get unacknowledged alerts
     * params: { page, limit, sortOrder }
     */
    getUnacknowledged: (params = {}) => {
        const queryParams = new URLSearchParams();
        if (params.page) queryParams.append('page', params.page);
        if (params.limit) queryParams.append('limit', params.limit);
        if (params.sortOrder) queryParams.append('sortOrder', params.sortOrder);

        // Handle legacy limit-only call
        if (typeof params === 'number') {
            return get(`/alerts/unacknowledged?limit=${params}`);
        }

        return get(`/alerts/unacknowledged?${queryParams.toString()}`);
    },

    /**
     * Acknowledge an alert
     */
    acknowledge: (id) => put(`/alerts/${id}/acknowledge`),

    /**
     * Resolve an alert
     */
    resolve: (id) => put(`/alerts/${id}/resolve`),

    /**
     * Delete an alert (Admin only)
     */
    delete: (id) => del(`/alerts/${id}`),

    /**
     * Acknowledge all alerts
     */
    acknowledgeAll: () => put('/alerts/acknowledge-all'),
};

export default alertService;
