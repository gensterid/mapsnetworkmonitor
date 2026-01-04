import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { userService } from '@/lib/api';

// Query Keys
export const userKeys = {
    all: ['users'],
    lists: () => [...userKeys.all, 'list'],
    detail: (id) => [...userKeys.all, 'detail', id],
    me: () => [...userKeys.all, 'me'],
};

// ==================== Queries ====================

/**
 * Hook to fetch all users
 */
export function useUsers(options = {}) {
    return useQuery({
        queryKey: userKeys.lists(),
        queryFn: () => userService.getAll(),
        staleTime: 60 * 1000,
        ...options,
    });
}

/**
 * Hook to fetch current user profile
 */
export function useCurrentUser(options = {}) {
    return useQuery({
        queryKey: userKeys.me(),
        queryFn: () => userService.getMe(),
        staleTime: 5 * 60 * 1000,
        ...options,
    });
}

/**
 * Hook to fetch a user by ID
 */
export function useUser(id, options = {}) {
    return useQuery({
        queryKey: userKeys.detail(id),
        queryFn: () => userService.getById(id),
        staleTime: 60 * 1000,
        enabled: !!id,
        ...options,
    });
}

// ==================== Mutations ====================

/**
 * Hook to update user profile
 */
export function useUpdateUser() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ id, data }) => userService.update(id, data),
        onSuccess: (_, { id }) => {
            queryClient.invalidateQueries({ queryKey: userKeys.detail(id) });
            queryClient.invalidateQueries({ queryKey: userKeys.me() });
            queryClient.invalidateQueries({ queryKey: userKeys.lists() });
        },
    });
}

/**
 * Hook to update user role
 */
export function useUpdateUserRole() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ id, role }) => userService.updateRole(id, role),
        onSuccess: (_, { id }) => {
            queryClient.invalidateQueries({ queryKey: userKeys.detail(id) });
            queryClient.invalidateQueries({ queryKey: userKeys.lists() });
        },
    });
}

/**
 * Hook to update user password (admin only)
 */
export function useUpdateUserPassword() {
    return useMutation({
        mutationFn: ({ id, password }) => userService.updatePassword(id, password),
    });
}

/**
 * Hook to delete a user
 */
export function useDeleteUser() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (id) => userService.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: userKeys.lists() });
        },
    });
}

/**
 * Hook to create a new user (admin only)
 */
export function useCreateUser() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (data) => userService.create(data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: userKeys.lists() });
        },
    });
}
