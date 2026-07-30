import { get, post, patch, del } from '@/lib/api';

/**
 * Provisioning Fase-1 (config awal ONU langsung di OLT). Backend: /provisioning.
 * Secret (acsPassword/pppoePassword) TAK pernah dikembalikan server — hanya flag
 * hasAcsPassword/hasPppoePassword. Kirim plaintext hanya saat diubah.
 */
export const provisioningService = {
    getPresets: () => get('/provisioning/presets'),
    getPreset: (id) => get(`/provisioning/presets/${id}`),
    createPreset: (data) => post('/provisioning/presets', data),
    updatePreset: (id, data) => patch(`/provisioning/presets/${id}`, data),
    deletePreset: (id) => del(`/provisioning/presets/${id}`),
};
