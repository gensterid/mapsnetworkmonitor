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

    return (
        <>
            <style>
                {`
                .${uniqueClass}:hover {
                    stroke-width: ${options.weight + 2}px !important;
                }
                `}
            </style>

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
                positions={positions}
                pathOptions={{
                    color: options.color,
                    weight: options.weight,
                    opacity: options.opacity,
                    className: `ans-path-base ans-style-${animationStyle} ${uniqueClass} ${options.className || ''} ${options.paused ? 'ans-paused' : ''}`,
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
