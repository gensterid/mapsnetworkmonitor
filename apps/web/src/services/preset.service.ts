
import { apiClient } from '@/lib/api';

export interface Preset {
    id: string;
    name: string;
    description: string;
    type: 'wan' | 'wifi';
    config: any;
    createdAt: string;
    updatedAt: string;
}

export const presetService = {
    getAll: async () => {
        const response = await apiClient.get('/presets');
        return response.data;
    },

    getById: async (id) => {
        const response = await apiClient.get(`/presets/${id}`);
        return response.data;
    },

    create: async (data) => {
        const response = await apiClient.post('/presets', data);
        return response.data;
    },

    update: async (id, data) => {
        const response = await apiClient.patch(`/presets/${id}`, data);
        return response.data;
    },

    delete: async (id) => {
        const response = await apiClient.delete(`/presets/${id}`);
        return response.data;
    }
};
