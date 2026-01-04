import { get, put, del } from '../client';

/**
 * Alert Service
 * Handles all alert-related API calls
 */
export const alertService = {
    /**
     * Get all alerts
     */
    getAll: (limit = 100) => get(`/alerts?limit=${limit}`),

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
     */
    getUnacknowledged: (limit = 100) => get(`/alerts/unacknowledged?limit=${limit}`),

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
