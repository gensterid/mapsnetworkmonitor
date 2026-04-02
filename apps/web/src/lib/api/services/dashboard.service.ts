import api from '../api';

export const dashboardService = {
    /**
     * Get dashboard statistics
     */
    getStats: async () => {
        const response = await api.get('/dashboard/stats');
        return response.data.data;
    },

    /**
     * Get down items for the interactive cards
     */
    getDownItems: async (type: 'netwatch' | 'pppoe') => {
        const response = await api.get('/dashboard/down-items', {
            params: { type }
        });
        return response.data.data;
    }
};
