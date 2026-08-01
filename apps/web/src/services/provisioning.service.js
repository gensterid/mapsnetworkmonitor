import { get, post, patch, del } from '@/lib/api';

/**
 * Provisioning Fase-1 (config awal ONU langsung di OLT). Backend: /provisioning.
 * Secret (acsPassword/pppoePassword) TAK pernah dikembalikan server — hanya flag
 * hasAcsPassword/hasPppoePassword. Kirim plaintext hanya saat diubah.
 */
export const provisioningService = {
    // Preset CRUD
    getPresets: () => get('/provisioning/presets'),
    getPreset: (id) => get(`/provisioning/presets/${id}`),
    createPreset: (data) => post('/provisioning/presets', data),
    updatePreset: (id, data) => patch(`/provisioning/presets/${id}`, data),
    deletePreset: (id) => del(`/provisioning/presets/${id}`),

    // Fase-1 authorize
    testConnection: (oltId) => get(`/provisioning/olts/${oltId}/test-connection`),
    getUnconfigured: (oltId) => get(`/provisioning/olts/${oltId}/unconfigured`),
    // Preview MURNI perintah authorize (tak menyentuh OLT).
    plan: (data) => post('/provisioning/plan', data),
    // TULIS-LIVE: authorize. confirm=true wajib. notify=1 → hasil ke topic Telegram.
    authorize: (oltId, data) => post(`/provisioning/olts/${oltId}/authorize?notify=1`, { ...data, confirm: true }),

    // Modify ONT teregister (mode auto-auth)
    getRegistered: (oltId) => get(`/provisioning/olts/${oltId}/registered`),
    planModify: (oltId, data) => post(`/provisioning/olts/${oltId}/plan-modify`, data),
    modify: (oltId, data) => post(`/provisioning/olts/${oltId}/modify?notify=1`, { ...data, confirm: true }),
};
