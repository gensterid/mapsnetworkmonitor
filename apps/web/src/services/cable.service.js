import { get, post, put, del } from '@/lib/api';

/**
 * Fiber cables (Cara C) — objek kabel digambar bebas + membawa sekumpulan core.
 * Lihat docs/FIBER-CABLE-DESIGN.md.
 */
export const cableService = {
    getAll: (routerId) => get(routerId ? `/cables?routerId=${encodeURIComponent(routerId)}` : '/cables'),
    getById: (id) => get(`/cables/${id}`),
    create: (data) => post('/cables', data),
    update: (id, data) => put(`/cables/${id}`, data),
    delete: (id) => del(`/cables/${id}`),
};
