/**
 * MikHMON Console service client.
 *
 * Namespaced by section to mirror the backend layout
 * (/api/mikhmon/:routerId/...). Each section will gain CRUD methods as
 * the phases progress; Phase A1 covers `info` (mode badge) and
 * `resource` (top-bar widget) only.
 */
import { get, post, patch, del, apiClient } from '@/lib/api';

export const mikhmonApi = {
    info: {
        /** GET /api/mikhmon/:routerId/info — router meta + hotspot_mode */
        get: (routerId) => get(`/mikhmon/${routerId}/info`),
    },
    system: {
        /** GET /api/mikhmon/:routerId/resource — live CPU/RAM/uptime */
        resource: (routerId) => get(`/mikhmon/${routerId}/resource`),
    },
    hotspotProfiles: {
        list: (routerId) => get(`/mikhmon/${routerId}/hotspot/profiles`),
        add: (routerId, input) => post(`/mikhmon/${routerId}/hotspot/profiles`, input),
        update: (routerId, id, input) => patch(`/mikhmon/${routerId}/hotspot/profiles/${encodeURIComponent(id)}`, input),
        remove: (routerId, id) => del(`/mikhmon/${routerId}/hotspot/profiles/${encodeURIComponent(id)}`),
    },
    ipBindings: {
        list: (routerId) => get(`/mikhmon/${routerId}/hotspot/ip-bindings`),
        add: (routerId, input) => post(`/mikhmon/${routerId}/hotspot/ip-bindings`, input),
        update: (routerId, id, input) => patch(`/mikhmon/${routerId}/hotspot/ip-bindings/${encodeURIComponent(id)}`, input),
        remove: (routerId, id) => del(`/mikhmon/${routerId}/hotspot/ip-bindings/${encodeURIComponent(id)}`),
    },
    walledGarden: {
        list: (routerId) => get(`/mikhmon/${routerId}/hotspot/walled-garden`),
        add: (routerId, input) => post(`/mikhmon/${routerId}/hotspot/walled-garden`, input),
        update: (routerId, id, input) => patch(`/mikhmon/${routerId}/hotspot/walled-garden/${encodeURIComponent(id)}`, input),
        remove: (routerId, id) => del(`/mikhmon/${routerId}/hotspot/walled-garden/${encodeURIComponent(id)}`),
    },
    queues: {
        list: (routerId) => get(`/mikhmon/${routerId}/queues`),
        add: (routerId, input) => post(`/mikhmon/${routerId}/queues`, input),
        update: (routerId, id, input) => patch(`/mikhmon/${routerId}/queues/${encodeURIComponent(id)}`, input),
        remove: (routerId, id) => del(`/mikhmon/${routerId}/queues/${encodeURIComponent(id)}`),
        stats: (routerId) => get(`/mikhmon/${routerId}/queues/stats`),
    },
    hotspotUsers: {
        list: (routerId) => get(`/mikhmon/${routerId}/hotspot/users`),
        add: (routerId, input) => post(`/mikhmon/${routerId}/hotspot/users`, input),
        update: (routerId, id, input) => patch(`/mikhmon/${routerId}/hotspot/users/${encodeURIComponent(id)}`, input),
        remove: (routerId, id) => del(`/mikhmon/${routerId}/hotspot/users/${encodeURIComponent(id)}`),
    },
    hotspotActive: {
        list: (routerId) => get(`/mikhmon/${routerId}/hotspot/active`),
        kick: (routerId, id) => del(`/mikhmon/${routerId}/hotspot/active/${encodeURIComponent(id)}`),
    },
    hotspotHosts: {
        list: (routerId) => get(`/mikhmon/${routerId}/hotspot/hosts`),
    },
    hotspotCookies: {
        list: (routerId) => get(`/mikhmon/${routerId}/hotspot/cookies`),
        remove: (routerId, id) => del(`/mikhmon/${routerId}/hotspot/cookies/${encodeURIComponent(id)}`),
    },
    hotspotServerProfiles: {
        list: (routerId) => get(`/mikhmon/${routerId}/hotspot/server-profiles`),
        add: (routerId, input) => post(`/mikhmon/${routerId}/hotspot/server-profiles`, input),
        update: (routerId, id, input) => patch(`/mikhmon/${routerId}/hotspot/server-profiles/${encodeURIComponent(id)}`, input),
        remove: (routerId, id) => del(`/mikhmon/${routerId}/hotspot/server-profiles/${encodeURIComponent(id)}`),
    },
    pppSecrets: {
        list: (routerId) => get(`/mikhmon/${routerId}/ppp/secrets`),
        add: (routerId, input) => post(`/mikhmon/${routerId}/ppp/secrets`, input),
        update: (routerId, id, input) => patch(`/mikhmon/${routerId}/ppp/secrets/${encodeURIComponent(id)}`, input),
        remove: (routerId, id) => del(`/mikhmon/${routerId}/ppp/secrets/${encodeURIComponent(id)}`),
    },
    pppProfiles: {
        list: (routerId) => get(`/mikhmon/${routerId}/ppp/profiles`),
        add: (routerId, input) => post(`/mikhmon/${routerId}/ppp/profiles`, input),
        update: (routerId, id, input) => patch(`/mikhmon/${routerId}/ppp/profiles/${encodeURIComponent(id)}`, input),
        remove: (routerId, id) => del(`/mikhmon/${routerId}/ppp/profiles/${encodeURIComponent(id)}`),
    },
    pppActive: {
        list: (routerId) => get(`/mikhmon/${routerId}/ppp/active`),
        kick: (routerId, id) => del(`/mikhmon/${routerId}/ppp/active/${encodeURIComponent(id)}`),
    },
    ipPools: {
        list: (routerId) => get(`/mikhmon/${routerId}/ip/pool`),
        add: (routerId, input) => post(`/mikhmon/${routerId}/ip/pool`, input),
        update: (routerId, id, input) => patch(`/mikhmon/${routerId}/ip/pool/${encodeURIComponent(id)}`, input),
        remove: (routerId, id) => del(`/mikhmon/${routerId}/ip/pool/${encodeURIComponent(id)}`),
    },
    dhcpLeases: {
        list: (routerId) => get(`/mikhmon/${routerId}/ip/dhcp-lease`),
        add: (routerId, input) => post(`/mikhmon/${routerId}/ip/dhcp-lease`, input),
        update: (routerId, id, input) => patch(`/mikhmon/${routerId}/ip/dhcp-lease/${encodeURIComponent(id)}`, input),
        makeStatic: (routerId, id) => post(`/mikhmon/${routerId}/ip/dhcp-lease/${encodeURIComponent(id)}/make-static`, {}),
        remove: (routerId, id) => del(`/mikhmon/${routerId}/ip/dhcp-lease/${encodeURIComponent(id)}`),
    },
    addressList: {
        list: (routerId) => get(`/mikhmon/${routerId}/ip/address-list`),
        add: (routerId, input) => post(`/mikhmon/${routerId}/ip/address-list`, input),
        update: (routerId, id, input) => patch(`/mikhmon/${routerId}/ip/address-list/${encodeURIComponent(id)}`, input),
        remove: (routerId, id) => del(`/mikhmon/${routerId}/ip/address-list/${encodeURIComponent(id)}`),
    },
    systemLog: {
        list: (routerId, opts = {}) => {
            const params: any = {};
            if (opts.topics) params.topics = opts.topics;
            if (opts.limit) params.limit = opts.limit;
            return get(`/mikhmon/${routerId}/system/log`, { params });
        },
    },
    systemPackages: {
        list: (routerId) => get(`/mikhmon/${routerId}/system/packages`),
    },
    systemScheduler: {
        list: (routerId) => get(`/mikhmon/${routerId}/system/scheduler`),
        add: (routerId, input) => post(`/mikhmon/${routerId}/system/scheduler`, input),
        update: (routerId, id, input) => patch(`/mikhmon/${routerId}/system/scheduler/${encodeURIComponent(id)}`, input),
        remove: (routerId, id) => del(`/mikhmon/${routerId}/system/scheduler/${encodeURIComponent(id)}`),
    },
    /**
     * Backup delegates to the existing /api/router-backups/* surface.
     * MikHMON UI calls these directly — no MikHMON-specific endpoint
     * exists, the integration is purely page-level.
     *
     * Those routes return raw payloads (not `{ data: ... }` wrapped), so
     * we use apiClient directly and read response.data ourselves.
     */
    backup: {
        list: (routerId) => apiClient.get(`/router-backups/${routerId}`).then((r) => r.data),
        create: (routerId, payload) => apiClient.post(`/router-backups/${routerId}`, payload).then((r) => r.data),
        downloadUrl: (backupId) => `/api/router-backups/download/${encodeURIComponent(backupId)}`,
        remove: (backupId) => apiClient.delete(`/router-backups/${encodeURIComponent(backupId)}`).then((r) => r.data),
    },
    vouchers: {
        /** Returns { data: items[], modeHint } — call .then((r) => r) to get full envelope. */
        list: (routerId) => apiClient.get(`/mikhmon/${routerId}/vouchers`).then((r) => r.data),
        /** Returns { data: { created, count, modeHint } } — payload at .data.data */
        generate: (routerId, input) => apiClient.post(`/mikhmon/${routerId}/vouchers/generate`, input).then((r) => r.data),
        remove: (routerId, id) => del(`/mikhmon/${routerId}/vouchers/${encodeURIComponent(id)}`),
    },
    profileBilling: {
        list: (routerId) => get(`/mikhmon/${routerId}/billing/profiles`),
        get: (routerId, profileName) => get(`/mikhmon/${routerId}/billing/profiles/${encodeURIComponent(profileName)}`),
        upsert: (routerId, input) => apiClient.put(`/mikhmon/${routerId}/billing/profiles`, input).then((r) => r.data?.data),
        remove: (routerId, profileName) => del(`/mikhmon/${routerId}/billing/profiles/${encodeURIComponent(profileName)}`),
    },
    scriptWizard: {
        install: (routerId, profileId, input) =>
            post(`/mikhmon/${routerId}/hotspot/profiles/${encodeURIComponent(profileId)}/install-scripts`, input),
        uninstall: (routerId, profileId) =>
            post(`/mikhmon/${routerId}/hotspot/profiles/${encodeURIComponent(profileId)}/uninstall-scripts`),
    },
    reports: {
        sales: (routerId, { from, to } = {}) => {
            const params = {};
            if (from) params.from = from;
            if (to) params.to = to;
            return get(`/mikhmon/${routerId}/reports/sales`, { params });
        },
    },
};

export default mikhmonApi;
