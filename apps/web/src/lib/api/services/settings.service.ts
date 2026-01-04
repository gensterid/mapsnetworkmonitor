import { get, put, del } from '../client';
import type { Setting, SettingsMap, AuditLog } from '../types';

/**
 * Settings Service
 * Handles all application settings and audit log API calls
 */
export const settingsService = {
    /**
     * Get all settings (Admin only)
     */
    getAll: () => get<Setting[]>('/settings'),

    /**
     * Get all settings as a key-value map
     */
    getAllAsMap: async (): Promise<SettingsMap> => {
        const settings = await get<Setting[]>('/settings');
        const map: SettingsMap = {};
        settings.forEach((s) => {
            map[s.key] = s.value;
        });
        return map;
    },

    /**
     * Get setting by key (Admin only)
     */
    getByKey: (key: string) => get<Setting>(`/settings/${key}`),

    /**
     * Update or create a setting (Admin only)
     */
    set: (key: string, value: unknown, description?: string) =>
        put<Setting>(`/settings/${key}`, { value, description }),

    /**
     * Delete a setting (Admin only)
     */
    delete: (key: string) => del(`/settings/${key}`),

    /**
     * Get audit logs (Admin only)
     */
    getAuditLogs: (limit = 100) => get<AuditLog[]>(`/settings/audit-logs?limit=${limit}`),
};

export default settingsService;
