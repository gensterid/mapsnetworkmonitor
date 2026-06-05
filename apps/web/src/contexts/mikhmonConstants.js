/**
 * Shared MikHMON shell constants. Lives in its own file so the context
 * file only exports React components (keeps Vite HMR happy).
 */

export const DEFAULT_REFRESH = 10_000; // 10s — gentle default

export const REFRESH_OPTIONS = [
    { value: null, label: 'Off' },
    { value: 5_000, label: '5s' },
    { value: 10_000, label: '10s' },
    { value: 30_000, label: '30s' },
];
