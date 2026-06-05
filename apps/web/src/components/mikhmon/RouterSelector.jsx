import React, { useEffect } from 'react';
import { useRouters } from '@/hooks/useRouters';
import { useMikhmonContext } from '@/contexts/useMikhmonContext';
import { Router } from 'lucide-react';
import clsx from 'clsx';

/**
 * Dropdown for selecting which router the MikHMON shell operates on.
 * - Auto-selects the first router on initial load if none is stored.
 * - Sync to URL `?router=<id>` whenever selection changes so deep-links
 *   work; URL changes here are non-destructive (replaceState) to keep
 *   the back button useful.
 */
export default function RouterSelector({ className }) {
    const { selectedRouterId, setSelectedRouterId } = useMikhmonContext();
    const { data: routers = [], isPending } = useRouters();

    // Auto-select first router if none stored yet
    useEffect(() => {
        if (!selectedRouterId && routers.length > 0) {
            const first = routers[0];
            if (first?.id) setSelectedRouterId(first.id);
        }
    }, [selectedRouterId, routers, setSelectedRouterId]);

    // Keep URL ?router=<id> in sync (non-destructive replace)
    useEffect(() => {
        if (!selectedRouterId) return;
        const url = new URL(window.location.href);
        if (url.searchParams.get('router') !== selectedRouterId) {
            url.searchParams.set('router', selectedRouterId);
            window.history.replaceState({}, '', url.toString());
        }
    }, [selectedRouterId]);

    // Adopt router from URL on mount if it differs from storage
    useEffect(() => {
        const url = new URL(window.location.href);
        const fromUrl = url.searchParams.get('router');
        if (fromUrl && fromUrl !== selectedRouterId) {
            // Only adopt if router exists in the loaded list (avoid bad deep-link)
            if (routers.some(r => r.id === fromUrl)) {
                setSelectedRouterId(fromUrl);
            }
        }
        // intentionally run only once routers are loaded
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [routers.length]);

    const handleChange = (e) => {
        setSelectedRouterId(e.target.value || null);
    };

    return (
        <div className={clsx('flex items-center gap-2', className)}>
            <Router className="w-4 h-4 text-slate-400 shrink-0" />
            <select
                value={selectedRouterId || ''}
                onChange={handleChange}
                disabled={isPending || routers.length === 0}
                className="bg-slate-900/60 border border-slate-700/50 text-slate-200 text-xs font-medium rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/30 min-w-0 sm:min-w-[150px] max-w-[180px] sm:max-w-[260px] truncate"
            >
                {routers.length === 0 && (
                    <option value="">{isPending ? 'Memuat router…' : 'Belum ada router'}</option>
                )}
                {routers.map((r) => (
                    <option key={r.id} value={r.id}>
                        {r.name} {r.host ? `(${r.host})` : ''}
                    </option>
                ))}
            </select>
        </div>
    );
}
