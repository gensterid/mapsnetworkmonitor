import { get } from '../client';

export const dashboardService = {
    /**
     * Get dashboard statistics
     */
    getStats: () => get<any>('/dashboard/stats'),

    /**
     * Get down items for the interactive cards
     */
    getDownItems: (type: 'netwatch' | 'pppoe') => 
        get<any>('/dashboard/down-items', {
            params: { type }
        })
};
