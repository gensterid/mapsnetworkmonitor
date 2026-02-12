import { apiClient } from '@/lib/api';

export const oltService = {
    // Get all OLTs
    getAll: async () => {
        const response = await apiClient.get('/olts');
        return response.data;
    },

    // Get OLT by ID
    getById: async (id: string) => {
        const response = await apiClient.get(`/olts/${id}`);
        return response.data;
    },

    // Create OLT
    create: async (data: any) => {
        const response = await apiClient.post('/olts', data);
        return response.data;
    },

    // Update OLT
    update: async (id: string, data: any) => {
        const response = await apiClient.patch(`/olts/${id}`, data);
        return response.data;
    },

    // Delete OLT
    delete: async (id: string) => {
        const response = await apiClient.delete(`/olts/${id}`);
        return response.data;
    },

    // Refresh OLT status
    refresh: async (id: string) => {
        const response = await apiClient.post(`/olts/${id}/refresh`);
        return response.data;
    },
};
