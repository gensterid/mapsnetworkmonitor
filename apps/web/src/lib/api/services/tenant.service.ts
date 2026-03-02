import { get, post, put, del } from '../client';

/**
 * Tenant Service
 * Handles all tenant/ISP management API calls
 */
export const tenantService = {
    // Get all tenants
    getAll: () => get('/tenants'),

    // Get tenant by ID
    getById: (id: string) => get(`/tenants/${id}`),

    // Create a new tenant
    create: (data: any) => post('/tenants', data),

    // Update a tenant
    update: (id: string, data: any) => put(`/tenants/${id}`, data),

    // Delete a tenant
    delete: (id: string) => del(`/tenants/${id}`),
};
