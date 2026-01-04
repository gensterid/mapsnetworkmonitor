import { get, post, put, del } from '../client';

/**
 * User Service
 * Handles all user-related API calls
 */
export const userService = {
    /**
     * Get all users (Admin only)
     */
    getAll: () => get('/users'),

    /**
     * Get current user profile
     */
    getMe: () => get('/users/me'),

    /**
     * Get user by ID
     */
    getById: (id) => get(`/users/${id}`),

    /**
     * Create a new user (Admin only)
     */
    create: (data) => post('/users', data),

    /**
     * Update user profile
     */
    update: (id, data) => put(`/users/${id}`, data),

    /**
     * Update user role (Admin only)
     */
    updateRole: (id, role) => put(`/users/${id}/role`, { role }),

    /**
     * Update user password (Admin only)
     */
    updatePassword: (id, password) => put(`/users/${id}/password`, { password }),

    /**
     * Delete user (Admin only)
     */
    delete: (id) => del(`/users/${id}`),
};

export default userService;
