/**
 * MikHMON Console service client.
 *
 * Namespaced by section to mirror the backend layout
 * (/api/mikhmon/:routerId/...). Each section will gain CRUD methods as
 * the phases progress; Phase A1 covers `info` (mode badge) and
 * `resource` (top-bar widget) only.
 */
import { get } from '@/lib/api';

export const mikhmonApi = {
    info: {
        /** GET /api/mikhmon/:routerId/info — router meta + hotspot_mode */
        get: (routerId) => get(`/mikhmon/${routerId}/info`),
    },
    system: {
        /** GET /api/mikhmon/:routerId/resource — live CPU/RAM/uptime */
        resource: (routerId) => get(`/mikhmon/${routerId}/resource`),
    },
};

export default mikhmonApi;
