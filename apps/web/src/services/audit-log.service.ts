import { get } from '@/lib/api';

export interface AuditLogEntry {
    id: string;
    action: string;
    entity: string;
    entityId: string | null;
    details: any;
    ipAddress: string | null;
    userAgent: string | null;
    createdAt: string;
    userId: string | null;
    userName: string | null;
    userEmail: string | null;
    userRole: string | null;
}

export interface AuditLogFilters {
    userId?: string;
    entity?: string;
    entityId?: string;
    action?: string;
    search?: string;
    startDate?: string;        // ISO string
    endDate?: string;
}

export interface AuditLogDistinct {
    entities: string[];
    actions: string[];
    users: Array<{ id: string; name: string; email: string | null }>;
}

function buildQuery(filters: AuditLogFilters, limit: number, offset: number) {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => {
        if (v) params.set(k, String(v));
    });
    params.set('limit', String(limit));
    params.set('offset', String(offset));
    return params.toString();
}

export const auditLogService = {
    list: async (filters: AuditLogFilters, limit: number, offset: number) => {
        const qs = buildQuery(filters, limit, offset);
        // Endpoint return { data: logs, total }. Lib `get` auto-extract
        // response.data.data — jadi kita dapat AuditLogEntry[] saja.
        // Untuk dapat total kita perlu raw response. Pakai apiClient langsung.
        const { apiClient } = await import('@/lib/api');
        const res = await apiClient.get(`/settings/audit-logs?${qs}`);
        return {
            logs: (res.data.data || []) as AuditLogEntry[],
            total: Number(res.data.total ?? 0),
        };
    },

    distinct: () => get<AuditLogDistinct>('/settings/audit-logs/distinct'),
};
