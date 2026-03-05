import { get, patch } from '../client';
import { PppSession } from '../types';

/**
 * PPPoE Service
 * Handles all PPPoE-related API calls (synced data from DB)
 */
export const pppoeService = {
    /**
     * Get all PPPoE sessions (optionally filtered by router)
     */
    getAll: (routerId?: string) => {
        const url = routerId ? `/pppoe?routerId=${routerId}` : '/pppoe';
        return get<PppSession[]>(url);
    },

    /**
     * Get PPPoE session by ID
     */
    getById: (id: string) => get<PppSession>(`/pppoe/${id}`),

    /**
     * Update PPPoE session coordinates
     */
    updateCoordinates: (id: string, data: { latitude?: string | null; longitude?: string | null; waypoints?: string }) =>
        patch<PppSession>(`/pppoe/${id}/coordinates`, data),
};
