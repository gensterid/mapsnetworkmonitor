import { get, post, patch, del } from '@/lib/api';

export interface Preset {
    id: string;
    name: string;
    description: string;
    type: 'wan' | 'wifi';
    config: any;
    createdAt: string;
    updatedAt: string;
}

export const presetService = {
    getAll: () => get<Preset[]>('/presets'),

    getById: (id) => get<Preset>(`/presets/${id}`),

    create: (data) => post<Preset>('/presets', data),

    update: (id, data) => patch<Preset>(`/presets/${id}`, data),

    delete: (id) => del(`/presets/${id}`)
};
