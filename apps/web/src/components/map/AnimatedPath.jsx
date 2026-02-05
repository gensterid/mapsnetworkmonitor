import React, { useMemo, useState } from 'react';
import { Polyline, Tooltip, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { getAnimationStyle } from './animationStyles';

/**
 * AnimatedPath Component
 * 
 * Renders a connection line between two coordinates with animation effects.
 * Uses native CSS animations via injected styles for better performance and stability.
 */
const AnimatedPath = ({
    positions,
    status,
    type,
    animationStyle = 'default',
    color,
    pulseColor,
    weight = 3,
    opacity = 1,
    delay = 800,
    dashArray = [10, 20],
    paused = false,
    reverse = false,
    hardwareAccelerated = false,
    onClick,
    tooltip,
    popup,
    enableAnimation = true
}) => {
    // Stable ID for this component instance to prevent class churn on re-renders
    const [uuid] = useState(() => Math.random().toString(36).substr(2, 9));

    // Memoize final options
    const options = useMemo(() => {
        const preset = animationStyle ? getAnimationStyle(animationStyle) : null;

        const lineDelay = preset?.delay ?? delay;
        const lineDashArray = preset?.dashArray ?? dashArray;
        const lineWeight = weight;
        const lineOpacity = preset?.opacity ?? opacity;
        const linePaused = !enableAnimation || (preset?.paused ?? paused);
        const lineReverse = preset?.reverse ?? reverse;
        const lineHardwareAccelerated = preset?.hardwareAccelerated || false;

        // Status-based colors
        let lineColor = preset?.color || color;
        let linePulseColor = pulseColor;

        // REMOVED LEGACY STATUS LOGIC
        // We now rely 100% on props passed from NetworkMap.jsx
        // This ensures the "Neon White Pulse" logic works for ALL statuses
        // without being overwritten by hardcoded values here.

        return {
            color: lineColor,
            pulseColor: linePulseColor,
            weight: lineWeight,
            opacity: lineOpacity,
            delay: lineDelay,
            dashArray: lineDashArray,
            paused: linePaused,
            reverse: lineReverse,
            hardwareAccelerated: lineHardwareAccelerated,
            className: preset?.className || '',
            lineCap: preset?.lineCap || 'butt',
            syncArrival: preset?.syncArrival || false,
            tooltip,
            popup,
        };
    }, [color, pulseColor, weight, opacity, delay, dashArray, paused, reverse, hardwareAccelerated, status, type, tooltip, popup, animationStyle, enableAnimation]);

    const uniqueClass = `anim-path-${uuid}`;

    // Standard flow speed using delay as duration
    const duration = `${options.delay}ms`;

    // Convert dashArray to string format for CSS and calculate sum for offset
    const dashArrayValues = Array.isArray(options.dashArray) ? options.dashArray : [10, 20];
    const dashArrayStr = dashArrayValues.join(', ');
    const dashArraySum = dashArrayValues.reduce((a, b) => a + b, 0);

    // Unique animation name based on the calculated sum
    // We prefix with 'dyn-' to avoid conflicts with static keyframes in map.css
    const animName = `dyn-flow-${dashArraySum}${options.reverse ? '-rev' : ''}`;

    // Ref for the Polyline
    const polylineRef = React.useRef(null);

    // Effect to apply CSS variables directly to the SVG path element
    React.useEffect(() => {
        if (!polylineRef.current) return;
        const layer = polylineRef.current;
        const pathElement = layer.getElement?.() || layer._path;

        if (pathElement) {
            let finalDashArrayStr = dashArrayStr;
            let finalDashArraySum = dashArraySum;

            // Robust Sync Arrival Logic using SVG pathLength normalization
            // This normalizes the coordinate system of the path to 1000 units
            // allowing us to animate 'from 0 to 1000' and it will ALWAYS take exactly 'duration'
            // to reach the end, regardless of the line's actual length or map zoom.
            if (options.syncArrival) {
                pathElement.setAttribute('pathLength', '1000');

                // We use a pattern based on the 1000 unit scale
                // Pattern: [dot_size, gap_to_end]
                // For 'classicPulse' with [4, 1000] initial, we translate to normalized units
                const basePattern = Array.isArray(options.dashArray) ? [...options.dashArray] : [4, 1000];
                const dotSize = basePattern[0];

                // A gap of 1000 ensures only one dot is visible at a time
                const syncedDashArray = [dotSize, 1000];
                finalDashArrayStr = syncedDashArray.join(', ');
                finalDashArraySum = dotSize + 1000;
            } else {
                // Remove pathLength if it was previously set to return to pixel-based units
                pathElement.removeAttribute('pathLength');
            }

            // Safety check for NaN values which break CSS
            if (isNaN(finalDashArraySum)) finalDashArraySum = 1000;

            // DEBUG LOG for User (Proxmox Troubleshooting)
            console.log(`[AnimatedPath] ${uuid} init:`, {
                style: animationStyle,
                sync: options.syncArrival,
                duration: duration,
                dash: finalDashArrayStr
            });

            // Dynamic Style Injection (Robust CSS Class)
            // We inject a specific style tag for this component instance
            // This ensures Leaflet's redraws (which wipe inline styles) do not kill the animation
            // Use a unique ID that includes uuid to ensure fresh injection
            const styleId = `style-path-${uuid}`;
            let styleSheet = document.getElementById(styleId);
            if (!styleSheet) {
                styleSheet = document.createElement("style");
                styleSheet.id = styleId;
                document.head.appendChild(styleSheet);
            }

            // Define the keyframes and the class-based animation rules with HIGH priority
            styleSheet.innerText = `
                @keyframes ${animName} {
                    from { stroke-dashoffset: 0; }
                    to { stroke-dashoffset: -${finalDashArraySum}; }
                }
                @keyframes ${animName}-rev {
                    from { stroke-dashoffset: 0; }
                    to { stroke-dashoffset: ${finalDashArraySum}; }
                }
                
                /* Apply animation via class with MAXIMUM priority for Proxmox stability */
                .anim-path-${uuid} {
                    stroke-dasharray: ${finalDashArrayStr} !important;
                    animation-name: ${animName} !important;
                    animation-duration: ${duration} !important;
                    animation-timing-function: linear !important;
                    animation-iteration-count: infinite !important;
                    animation-play-state: ${options.paused ? 'paused' : 'running'} !important;
                    stroke-linecap: ${options.lineCap} !important;
                    stroke-linejoin: ${options.lineJoin} !important;
                    will-change: stroke-dashoffset;
                }

                /* Ensure color priority for this specific path */
                .anim-path-${uuid} {
                    stroke: ${options.color} !important;
                }
            `;
        }

        // Cleanup function to remove style tag when component unmounts
        return () => {
            const styleSheet = document.getElementById(`style-path-${uuid}`);
            if (styleSheet) {
                styleSheet.remove();
            }
        };
    }, [dashArrayStr, duration, animName, options.paused, dashArraySum, options.color, options.lineCap, options.lineJoin, uuid, positions, options.syncArrival, animationStyle]);

    return (
        <>
            {/* Background Rail */}
            <Polyline
                positions={positions}
                pathOptions={{
                    color: options.pulseColor,
                    weight: options.weight,
                    opacity: Math.max(0.1, options.opacity - 0.2),
                    className: options.className ? `${options.className}-rail` : ''
                }}
            />

            {/* Foreground Moving Ants */}
            <Polyline
                ref={polylineRef}
                positions={positions}
                pathOptions={{
                    color: options.color,
                    weight: options.color === '#ffffff' ? options.weight + 3 : options.weight,
                    opacity: options.opacity,
                    // Restore dashArray to ensure Leaflet renders dashes natively
                    dashArray: dashArrayStr,
                    className: `ans-path-base ${uniqueClass} ${options.className || ''} ${options.paused ? 'ans-paused' : ''}`,
                    fill: false,
                    lineCap: options.lineCap || 'butt',
                    lineJoin: options.lineJoin || 'round'
                }}
                eventHandlers={onClick ? { click: onClick } : null}
            >
                {options.tooltip && (
                    <Tooltip sticky direction="top" className="custom-map-tooltip" opacity={1}>
                        <div dangerouslySetInnerHTML={{ __html: options.tooltip }} />
                    </Tooltip>
                )}
                {options.popup && (
                    <Popup>
                        <div dangerouslySetInnerHTML={{ __html: options.popup }} />
                    </Popup>
                )}
            </Polyline>
        </>
    );
};

export default AnimatedPath;
