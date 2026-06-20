import { useSyncExternalStore } from 'react';

/**
 * Breakpoint detection hooks (matchMedia-based).
 *
 * SSR-safe via useSyncExternalStore — concurrent rendering compatible.
 *
 * Standardized breakpoint system (match Tailwind defaults):
 *   - Mobile:  < 768px  (default, no prefix)
 *   - Tablet:  768px+   (md:)
 *   - Desktop: 1024px+  (lg:)
 *   - Wide:    1280px+  (xl:)
 *
 * Use these hooks for JS-side decisions (component rendering, behavior).
 * For CSS-only responsive use Tailwind md:/lg:/xl: prefixes directly.
 *
 * NEVER use arbitrary breakpoints. Always one of the 4 above.
 */

const BREAKPOINTS = {
    mobile: '(max-width: 767px)',
    tablet: '(min-width: 768px) and (max-width: 1023px)',
    desktop: '(min-width: 1024px)',
    wide: '(min-width: 1280px)',
    mdUp: '(min-width: 768px)',
    lgUp: '(min-width: 1024px)',
};

// Per code-review HIGH-1: subscribe + snapshot HARUS stable per query.
// Sebelumnya factory return new function per call \xe2\x86\x92 useSyncExternalStore
// tear-down + re-subscribe per render \xe2\x86\x92 listener churn + tearing risk.
// Cache per query string supaya identity preserved across renders.
const subscribeCache = new Map();
const snapshotCache = new Map();

function getStableSubscribe(query) {
    if (!subscribeCache.has(query)) {
        subscribeCache.set(query, (callback) => {
            if (typeof window === 'undefined' || !window.matchMedia) {
                return () => {};
            }
            const mq = window.matchMedia(query);
            const handler = () => callback();
            if (mq.addEventListener) mq.addEventListener('change', handler);
            else mq.addListener?.(handler);
            return () => {
                if (mq.removeEventListener) mq.removeEventListener('change', handler);
                else mq.removeListener?.(handler);
            };
        });
    }
    return subscribeCache.get(query);
}

function getStableSnapshot(query) {
    if (!snapshotCache.has(query)) {
        snapshotCache.set(query, () => {
            if (typeof window === 'undefined' || !window.matchMedia) return false;
            return window.matchMedia(query).matches;
        });
    }
    return snapshotCache.get(query);
}

const SSR_FALLBACK = () => false;

function useMediaQuery(query) {
    return useSyncExternalStore(
        getStableSubscribe(query),
        getStableSnapshot(query),
        SSR_FALLBACK,
    );
}

/** True when viewport < 768px (mobile). */
export function useIsMobile() {
    return useMediaQuery(BREAKPOINTS.mobile);
}

/** True when viewport 768px – 1023px (tablet only). */
export function useIsTablet() {
    return useMediaQuery(BREAKPOINTS.tablet);
}

/** True when viewport >= 1024px (desktop and wider). */
export function useIsDesktop() {
    return useMediaQuery(BREAKPOINTS.desktop);
}

/** True when viewport >= 768px (tablet up — desktop included). */
export function useIsTabletUp() {
    return useMediaQuery(BREAKPOINTS.mdUp);
}
