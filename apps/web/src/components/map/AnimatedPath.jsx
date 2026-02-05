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
        let lineColor = color;
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
            useCustomCSS: preset?.useCustomCSS || false,
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
    const animName = `flow-${dashArraySum}${options.reverse ? '-rev' : ''}`;

    // Ref for the Polyline
    const polylineRef = React.useRef(null);

    // Effect to apply CSS variables directly to the SVG path element
    React.useEffect(() => {
        if (!polylineRef.current) return;
        const layer = polylineRef.current;
        const pathElement = layer.getElement?.() || layer._path;

        if (pathElement) {
            // Dynamic Keyframe Injection
            if (!document.getElementById(`style-${animName}`)) {
                const styleSheet = document.createElement("style");
                styleSheet.id = `style-${animName}`;
                styleSheet.innerText = `
                    @keyframes ${animName} {
                        from { stroke-dashoffset: 0; }
                        to { stroke-dashoffset: -${dashArraySum}; }
                    }
                    @keyframes ${animName}-rev {
                        from { stroke-dashoffset: 0; }
                        to { stroke-dashoffset: ${dashArraySum}; }
                    }
                `;
                document.head.appendChild(styleSheet);
            }

            // Set variables
            pathElement.style.setProperty('--path-dasharray', dashArrayStr);
            pathElement.style.setProperty('--path-duration', duration);
            pathElement.style.setProperty('--path-anim-name', animName);

            // Sync CSS color
            if (options.color) {
                pathElement.style.setProperty('color', options.color);
            }

            // Set direct CSS properties
            pathElement.style.setProperty('stroke-dasharray', dashArrayStr, 'important');

            // Only apply specific animation properties if NOT using custom CSS
            // This allows complex styles like 'cyberFlow' to define their own animations in CSS
            if (!options.useCustomCSS) {
                pathElement.style.setProperty('animation-name', animName, 'important');
                pathElement.style.setProperty('animation-duration', duration, 'important');
                pathElement.style.setProperty('animation-timing-function', 'linear', 'important');
                pathElement.style.setProperty('animation-iteration-count', 'infinite', 'important');
                pathElement.style.setProperty('animation-play-state', options.paused ? 'paused' : 'running', 'important');
            } else {
                // For custom CSS, we just ensure it's running
                pathElement.style.setProperty('animation-play-state', options.paused ? 'paused' : 'running', 'important');
            }

            pathElement.style.setProperty('stroke-linecap', options.lineCap, 'important');
            pathElement.style.setProperty('stroke-linejoin', options.lineJoin, 'important');
        }
    }, [dashArrayStr, duration, animName, options.paused, dashArraySum, options.color, options.lineCap, options.lineJoin, options.useCustomCSS]);

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
                    // Make the pulse thicker than the rail to appear as a "round dot" sitting ON the line
                    weight: options.color === '#ffffff' ? options.weight + 3 : options.weight,
                    opacity: options.opacity,
                    // We keep the uniqueClass for selection but don't rely on it for variables anymore
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
