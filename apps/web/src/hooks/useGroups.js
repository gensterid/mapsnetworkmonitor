import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { groupService } from '@/lib/api';

// Query Keys
export const groupKeys = {
    all: (tenantId) => ['groups', tenantId || 'default'],
    lists: (tenantId) => [...groupKeys.all(tenantId), 'list'],
    detail: (tenantId, id) => [...groupKeys.all(tenantId), 'detail', id],
};

// ==================== Helpers ====================
const getActiveTenantId = () => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('active-tenant-id');
};

// ==================== Queries ====================

/**
 * Hook to fetch all groups
 */
export function useGroups(options = {}) {
    const tenantId = getActiveTenantId();
    return useQuery({
        queryKey: groupKeys.lists(tenantId),
        queryFn: () => groupService.getAll(),
        staleTime: 5 * 60 * 1000,
        ...options,
    });
}

/**
 * Hook to fetch a group by ID
 */
export function useGroup(id, options = {}) {
    const tenantId = getActiveTenantId();
    return useQuery({
        queryKey: groupKeys.detail(tenantId, id),
        queryFn: () => groupService.getById(id),
        enabled: !!id,
        ...options,
    });
}

// ==================== Mutations ====================

/**
 * Hook to create a new group
 */
export function useCreateGroup() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (data) => groupService.create(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: groupKeys.lists() });
        },
    });
}

/**
 * Hook to update a group
 */
export function useUpdateGroup() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ id, data }) => groupService.update(id, data),
        onSuccess: (_, { id }) => {
            queryClient.invalidateQueries({ queryKey: groupKeys.detail(id) });
            queryClient.invalidateQueries({ queryKey: groupKeys.lists() });
        },
    });
}

/**
 * Hook to delete a group
 */
export function useDeleteGroup() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (id) => groupService.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: groupKeys.lists() });
        },
    });
}
