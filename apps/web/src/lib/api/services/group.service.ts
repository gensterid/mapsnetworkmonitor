import { get, post, put, del } from '../client';
import type { Group, CreateGroupInput, UpdateGroupInput } from '../types';

/**
 * Group Service
 * Handles all router group-related API calls
 */
export const groupService = {
    /**
     * Get all groups
     */
    getAll: () => get<Group[]>('/groups'),

    /**
     * Get group by ID
     */
    getById: (id: string) => get<Group>(`/groups/${id}`),

    /**
     * Create a new group (Admin only)
     */
    create: (data: CreateGroupInput) => post<Group>('/groups', data),

    /**
     * Update a group (Admin only)
     */
    update: (id: string, data: UpdateGroupInput) => put<Group>(`/groups/${id}`, data),

    /**
     * Delete a group (Admin only)
     */
    delete: (id: string) => del(`/groups/${id}`),
};

export default groupService;
