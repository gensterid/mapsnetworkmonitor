import React, { createContext, useState, useEffect, useCallback, useMemo } from 'react';
import { REFRESH_OPTIONS, DEFAULT_REFRESH } from './mikhmonConstants';

/**
 * MikHMON shell context.
 * - selectedRouterId: persisted to localStorage so the operator returns to
 *   the same router on next visit. Pages can also sync from the URL
 *   `?router=<id>` query param when deep-linked.
 * - autoRefreshMs: global default for TanStack `refetchInterval`. Pages
 *   may override per-query. Polling pauses while the tab is hidden.
 */

const STORAGE_KEY = 'mikhmon.routerId';
const REFRESH_KEY = 'mikhmon.autoRefreshMs';

export const MikhmonContext = createContext(null);

function readStoredRouterId() {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        return stored || null;
    } catch {
        return null;
    }
}

function readStoredRefresh() {
    try {
        const raw = localStorage.getItem(REFRESH_KEY);
        if (raw === null) return DEFAULT_REFRESH;
        if (raw === 'null') return null;
        const parsed = parseInt(raw, 10);
        return Number.isFinite(parsed) ? parsed : DEFAULT_REFRESH;
    } catch {
        return DEFAULT_REFRESH;
    }
}

export function MikhmonProvider({ children }) {
    const [selectedRouterId, _setSelectedRouterId] = useState(readStoredRouterId);
    const [autoRefreshMs, _setAutoRefreshMs] = useState(readStoredRefresh);
    const [tabVisible, setTabVisible] = useState(typeof document !== 'undefined' ? !document.hidden : true);

    const setSelectedRouterId = useCallback((id) => {
        _setSelectedRouterId(id);
        try {
            if (id) localStorage.setItem(STORAGE_KEY, id);
            else localStorage.removeItem(STORAGE_KEY);
        } catch { /* localStorage unavailable */ }
    }, []);

    const setAutoRefreshMs = useCallback((ms) => {
        _setAutoRefreshMs(ms);
        try {
            localStorage.setItem(REFRESH_KEY, ms === null ? 'null' : String(ms));
        } catch { /* localStorage unavailable */ }
    }, []);

    // Pause polling when tab is hidden — saves backend load + battery
    useEffect(() => {
        const onVisibility = () => setTabVisible(!document.hidden);
        document.addEventListener('visibilitychange', onVisibility);
        return () => document.removeEventListener('visibilitychange', onVisibility);
    }, []);

    // Effective refetch interval seen by hooks: null when tab hidden so
    // TanStack stops polling automatically.
    const effectiveRefetchInterval = tabVisible ? autoRefreshMs : null;

    const value = useMemo(() => ({
        selectedRouterId,
        setSelectedRouterId,
        autoRefreshMs,
        setAutoRefreshMs,
        refetchInterval: effectiveRefetchInterval,
        tabVisible,
    }), [selectedRouterId, setSelectedRouterId, autoRefreshMs, setAutoRefreshMs, effectiveRefetchInterval, tabVisible]);

    return <MikhmonContext.Provider value={value}>{children}</MikhmonContext.Provider>;
}

