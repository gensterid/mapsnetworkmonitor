import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { groupService } from '@/lib/api';

// Query Keys
export const groupKeys = {
    all: ['groups'],
    lists: () => [...groupKeys.all, 'list'],
    detail: (id) => [...groupKeys.all, 'detail', id],
};

// ==================== Queries ====================

/**
 * Hook to fetch all groups
 */
export function useGroups(options = {}) {
    return useQuery({
        queryKey: groupKeys.lists(),
        queryFn: () => groupService.getAll(),
        staleTime: 5 * 60 * 1000,
        ...options,
    });
}

/**
 * Hook to fetch a group by ID
 */
export function useGroup(id, options = {}) {
    return useQuery({
        queryKey: groupKeys.detail(id),
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
