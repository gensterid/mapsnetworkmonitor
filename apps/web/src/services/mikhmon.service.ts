/**
 * MikHMON Console service client.
 *
 * Namespaced by section to mirror the backend layout
 * (/api/mikhmon/:routerId/...). Each section will gain CRUD methods as
 * the phases progress; Phase A1 covers `info` (mode badge) and
 * `resource` (top-bar widget) only.
 */
import { get, post, patch, del } from '@/lib/api';

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
};

export default mikhmonApi;
