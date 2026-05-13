import React from 'react';

/**
 * Theme-aware toggle switch. Track + thumb colors come from CSS variables
 * (--toggle-off-bg, --toggle-thumb) so they remain readable across every
 * theme — including SpaceX where --primary is white and a hardcoded white
 * thumb would be invisible against the ON state.
 *
 * size="md" (default) — 44×24 px, used in Settings panels
 * size="sm"           — 36×20 px, used in compact rows (Edit Router modal etc.)
 */
export default function Toggle({
    checked,
    onChange,
    disabled = false,
    ariaLabel,
    size = 'md',
    className = '',
}) {
    const isSm = size === 'sm';
    const trackCls = isSm ? 'w-9 h-5' : 'w-11 h-6';
    const thumbCls = isSm ? 'after:h-4 after:w-4' : 'after:h-5 after:w-5';
    return (
        <label className={`relative inline-flex items-center ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'} ${className}`}>
            <input
                type="checkbox"
                checked={!!checked}
                onChange={(e) => onChange?.(e.target.checked)}
                disabled={disabled}
                aria-label={ariaLabel}
                className="sr-only peer"
            />
            <div className={`${trackCls} bg-[var(--toggle-off-bg)] peer-focus:ring-2 peer-focus:ring-primary rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-[var(--toggle-thumb)] after:rounded-full ${thumbCls} after:transition-all peer-checked:bg-primary peer-disabled:opacity-50`} />
        </label>
    );
}
