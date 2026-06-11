import { useQuery } from '@tanstack/react-query';
import { auditLogService } from '../services/audit-log.service';

export function useAuditLogs(filters, limit, offset) {
    return useQuery({
        queryKey: ['audit-logs', filters, limit, offset],
        queryFn: () => auditLogService.list(filters, limit, offset),
        keepPreviousData: true,
        staleTime: 10_000,
    });
}

export function useAuditLogDistinct() {
    return useQuery({
        queryKey: ['audit-logs', 'distinct'],
        queryFn: auditLogService.distinct,
        staleTime: 60_000,                       // distinct values jarang berubah
    });
}
