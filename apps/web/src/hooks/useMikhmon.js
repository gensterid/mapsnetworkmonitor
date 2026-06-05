/**
 * MikHMON Console data hooks.
 * Phase A1: router info (mode badge) + system resource (top-bar widget).
 * Later phases add hotspot/queue/ip/system hooks here.
 */
import { useQuery } from '@tanstack/react-query';
import { mikhmonApi } from '@/services/mikhmon.service';
import { useMikhmonContext } from '@/contexts/useMikhmonContext';

export const mikhmonKeys = {
    all: (routerId) => ['mikhmon', routerId],
    info: (routerId) => [...mikhmonKeys.all(routerId), 'info'],
    resource: (routerId) => [...mikhmonKeys.all(routerId), 'resource'],
};

/**
 * Router meta + hotspot_mode. Cached longer than live data — mode rarely
 * changes mid-session.
 */
export function useMikhmonInfo(routerId, options = {}) {
    return useQuery({
        queryKey: mikhmonKeys.info(routerId),
        queryFn: () => mikhmonApi.info.get(routerId),
        enabled: !!routerId,
        staleTime: 60 * 1000,
        ...options,
    });
}

/**
 * Live /system/resource snapshot. Defaults to the context's
 * effectiveRefetchInterval so it auto-pauses when the tab is hidden.
 */
export function useMikhmonResource(routerId, options = {}) {
    const { refetchInterval } = useMikhmonContext();
    return useQuery({
        queryKey: mikhmonKeys.resource(routerId),
        queryFn: () => mikhmonApi.system.resource(routerId),
        enabled: !!routerId,
        refetchInterval: options.refetchInterval ?? refetchInterval ?? false,
        refetchIntervalInBackground: false,
        staleTime: 2_000,
        ...options,
    });
}
