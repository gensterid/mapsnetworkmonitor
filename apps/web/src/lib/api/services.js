import { get, post, put, del } from './client';

/**
 * Router Service
 * Handles all router-related API calls
 */
export const routerService = {
    // Get all routers
    getAll: () => get('/routers'),

    // Get router by ID
    getById: (id) => get(`/routers/${id}`),

    // Create a new router
    create: (data) => post('/routers', data),

    // Update a router
    update: (id, data) => put(`/routers/${id}`, data),

    // Delete a router
    delete: (id) => del(`/routers/${id}`),

    // Test connection to a router by ID
    testConnection: (id) => post(`/routers/${id}/test`),

    // Test connection with credentials
    testConnectionWithCredentials: (data) => post('/routers/test-connection', data),

    // Refresh router status
    refresh: (id) => post(`/routers/${id}/refresh`),

    // Reboot a router
    reboot: (id) => post(`/routers/${id}/reboot`),

    // Get router interfaces
    getInterfaces: (routerId) => get(`/routers/${routerId}/interfaces`),

    // Get latest router metrics
    getMetrics: (routerId) => get(`/routers/${routerId}/metrics`),

    // Get router metrics history
    getMetricsHistory: (routerId, limit = 100) =>
        get(`/routers/${routerId}/metrics/history?limit=${limit}`),

    // Get all netwatch entries for a router
    getNetwatch: (routerId) => get(`/routers/${routerId}/netwatch`),

    // Create a netwatch entry
    createNetwatch: (routerId, data) => post(`/routers/${routerId}/netwatch`, data),

    // Update a netwatch entry
    updateNetwatch: (routerId, netwatchId, data) =>
        put(`/routers/${routerId}/netwatch/${netwatchId}`, data),

    // Delete a netwatch entry
    deleteNetwatch: (routerId, netwatchId) =>
        del(`/routers/${routerId}/netwatch/${netwatchId}`),

    // Sync netwatch from MikroTik router
    syncNetwatch: (routerId) => post(`/routers/${routerId}/netwatch/sync`),

    // Get active hotspot users
    getHotspotActive: (routerId) => get(`/routers/${routerId}/hotspot/active`),

    // Get active PPP active
    getPppActive: (routerId) => get(`/routers/${routerId}/ppp/active`),
};

/**
 * User Service
 * Handles all user-related API calls
 */
export const userService = {
    // Get all users
    getAll: () => get('/users'),

    // Get current user profile
    getMe: () => get('/users/me'),

    // Get user by ID
    getById: (id) => get(`/users/${id}`),

    // Create a new user (Admin only)
    create: (data) => post('/users', data),

    // Update user profile
    update: (id, data) => put(`/users/${id}`, data),

    // Update user role
    updateRole: (id, role) => put(`/users/${id}/role`, { role }),

    // Update user password (admin only)
    updatePassword: (id, password) => put(`/users/${id}/password`, { password }),

    // Delete user
    delete: (id) => del(`/users/${id}`),
};

/**
 * Alert Service
 * Handles all alert-related API calls
 */
export const alertService = {
    // Get all alerts
    getAll: (params = {}) => {
        // Handle legacy limit argument
        if (typeof params === 'number') {
            return get(`/alerts?limit=${params}`);
        }

        const queryParams = new URLSearchParams();
        Object.keys(params).forEach(key => {
            if (params[key] !== undefined && params[key] !== null) {
                queryParams.append(key, params[key]);
            }
        });

        return get(`/alerts?${queryParams.toString()}`);
    },

    // Get alert by ID
    getById: (id) => get(`/alerts/${id}`),

    // Get unread alert count
    getUnreadCount: () => get('/alerts/unread'),

    // Get unacknowledged alerts
    getUnacknowledged: (params = {}) => {
        // Handle legacy limit argument
        if (typeof params === 'number') {
            return get(`/alerts/unacknowledged?limit=${params}`);
        }

        const queryParams = new URLSearchParams();
        Object.keys(params).forEach(key => {
            if (params[key] !== undefined && params[key] !== null) {
                queryParams.append(key, params[key]);
            }
        });

        return get(`/alerts/unacknowledged?${queryParams.toString()}`);
    },

    // Acknowledge an alert
    acknowledge: (id) => put(`/alerts/${id}/acknowledge`),

    // Acknowledge all alerts
    acknowledgeAll: () => put('/alerts/acknowledge-all'),

    // Resolve an alert
    resolve: (id) => put(`/alerts/${id}/resolve`),

    // Delete an alert
    delete: (id) => del(`/alerts/${id}`),
};

/**
 * Group Service
 * Handles all router group-related API calls
 */
export const groupService = {
    // Get all groups
    getAll: () => get('/groups'),

    // Get group by ID
    getById: (id) => get(`/groups/${id}`),

    // Create a new group
    create: (data) => post('/groups', data),

    // Update a group
    update: (id, data) => put(`/groups/${id}`, data),

    // Delete a group
    delete: (id) => del(`/groups/${id}`),
};

/**
 * Settings Service
 * Handles all application settings and audit log API calls
 */
export const settingsService = {
    // Get all settings
    getAll: () => get('/settings'),

    // Get all settings as a key-value map
    getAllAsMap: async () => {
        const settings = await get('/settings');
        const map = {};
        settings.forEach((s) => {
            map[s.key] = s.value;
        });
        return map;
    },

    // Get setting by key
    getByKey: (key) => get(`/settings/${key}`),

    // Update or create a setting
    set: (key, value, description) => put(`/settings/${key}`, { value, description }),

    // Delete a setting
    delete: (key) => del(`/settings/${key}`),

    // Get audit logs
    getAuditLogs: (limit = 100) => get(`/settings/audit-logs?limit=${limit}`),
};
