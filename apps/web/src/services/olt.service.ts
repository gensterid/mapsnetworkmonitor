import { get, post, patch, del } from '@/lib/api';

export const oltService = {
    // Get all OLTs
    getAll: () => get<any[]>('/olts'),

    // Get OLT by ID
    getById: (id: string) => get<any>(`/olts/${id}`),

    // Create OLT
    create: (data: any) => post<any>('/olts', data),

    // Update OLT
    update: (id: string, data: any) => patch<any>(`/olts/${id}`, data),

    // Delete OLT
    delete: (id: string) => del(`/olts/${id}`),

    // Refresh OLT status
    refresh: (id: string) => post<any>(`/olts/${id}/refresh`),

    // Get OLT ONUs
    getOnus: (id: string) => get<any[]>(`/olts/${id}/onus`),

    // Update ONU
    updateOnu: (id: string, onuId: string, data: any) => patch<any>(`/olts/${id}/onus/${onuId}`, data),

    // Reboot ONU
    rebootOnu: (id: string, onuId: string, ponId: string) => post<any>(`/olts/${id}/onus/${onuId}/reboot`, { ponId }),

    // Archive ONU (hide from map). Auto-restored if SN reappears in OLT polling.
    archiveOnu: (id: string, onuId: string) => post<any>(`/olts/${id}/onus/${onuId}/archive`),

    // Reassign ONU to a different OLT (manual move after physical PON migration)
    reassignOnu: (onuId: string, targetOltId: string, targetPonPort: string | null) =>
        post<any>(`/olts/onus/${onuId}/reassign`, { targetOltId, targetPonPort }),
};
