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

        if (pulseColor === '#ffffff' && status === 'up') {
            linePulseColor = 'rgba(56, 189, 248, 0.2)'; // Sky-400 with opacity
            lineColor = '#38bdf8'; // Sky-400
        }

        if (status === 'down') {
            lineColor = '#ef4444';
            linePulseColor = 'rgba(239, 68, 68, 0.2)';
        } else if (type === 'pppoe') {
            lineColor = '#a855f7';
            linePulseColor = 'rgba(168, 85, 247, 0.2)';
        } else if (type === 'odp') {
            lineColor = '#f59e0b';
            linePulseColor = 'rgba(245, 158, 11, 0.2)';
        } else if (type === 'olt') {
            lineColor = '#8b5cf6';
            linePulseColor = 'rgba(139, 92, 246, 0.2)';
        } else if (status === 'unknown') {
            lineColor = '#94a3b8';
            linePulseColor = 'rgba(148, 163, 184, 0.2)';
        } else if (status === 'up') {
            // Default to green for 'up' status if no specific type matched and no color provided
            if (!lineColor || lineColor === '#10b981') {
                lineColor = '#10b981';
                linePulseColor = 'rgba(16, 185, 129, 0.2)';
            }
        }

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
            tooltip,
            popup,
        };
    }, [color, pulseColor, weight, opacity, delay, dashArray, paused, reverse, hardwareAccelerated, status, type, tooltip, popup, animationStyle, enableAnimation]);

    const uniqueClass = `anim-path-${uuid}`;

    // Convert dashArray to string format for CSS and calculate sum for offset
    const dashArrayValues = Array.isArray(options.dashArray) ? options.dashArray : [10, 20];
    const dashArrayStr = dashArrayValues.join(', ');
    const dashArraySum = dashArrayValues.reduce((a, b) => a + b, 0);

    // Flow speed calculation: we use the delay as duration
    const duration = `${options.delay}ms`;

    // Choose the right keyframe name BASED ON THE SUM
    // This is much more robust than using generic names with variables
    const animName = `flow-${dashArraySum}${options.reverse ? '-rev' : ''}`;

    // Ref for the Polyline
    const polylineRef = React.useRef(null);

    // Effect to apply CSS variables directly to the SVG path element
    React.useEffect(() => {
        if (!polylineRef.current) return;

        // Access the underlying Leaflet layer
        const layer = polylineRef.current;

        // Leaflet stores the path element in _path or getElement()
        const pathElement = layer.getElement?.() || layer._path;

        if (pathElement) {
            // Set variables (still useful for premium effects that inherit them)
            pathElement.style.setProperty('--path-dasharray', dashArrayStr);
            pathElement.style.setProperty('--path-duration', duration);
            pathElement.style.setProperty('--path-anim-name', animName);

            // Set direct CSS properties for maximum compatibility
            // These overwrite anything from classes
            pathElement.style.setProperty('stroke-dasharray', dashArrayStr, 'important');
            pathElement.style.setProperty('animation-name', animName, 'important');
            pathElement.style.setProperty('animation-duration', duration, 'important');
            pathElement.style.setProperty('animation-timing-function', 'linear', 'important');
            pathElement.style.setProperty('animation-iteration-count', 'infinite', 'important');

            // Handle paused state
            pathElement.style.setProperty('animation-play-state', options.paused ? 'paused' : 'running', 'important');
        }
    }, [dashArrayStr, duration, animName, options.paused]);

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
                    weight: options.weight,
                    opacity: options.opacity,
                    // We keep the uniqueClass for selection but don't rely on it for variables anymore
                    className: `ans-path-base ${uniqueClass} ${options.className || ''} ${options.paused ? 'ans-paused' : ''}`,
                    fill: false
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
