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

function subscribeMatchMedia(query) {
    return (callback) => {
        if (typeof window === 'undefined' || !window.matchMedia) {
            return () => {};
        }
        const mq = window.matchMedia(query);
        const handler = () => callback();
        mq.addEventListener?.('change', handler) ?? mq.addListener?.(handler);
        return () => {
            mq.removeEventListener?.('change', handler) ?? mq.removeListener?.(handler);
        };
    };
}

function getSnapshot(query) {
    return () => {
        if (typeof window === 'undefined' || !window.matchMedia) return false;
        return window.matchMedia(query).matches;
    };
}

const SSR_FALLBACK = () => false;

function useMediaQuery(query) {
    return useSyncExternalStore(
        subscribeMatchMedia(query),
        getSnapshot(query),
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
