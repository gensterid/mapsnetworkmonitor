import React, { useEffect, useRef, useMemo } from 'react';
import { Polyline, Tooltip, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
// import 'leaflet-ant-path'; // No longer used, replaced with native CSS animation
import { getAnimationStyle } from './animationStyles';

/**
 * AnimatedPath - A component that renders animated "marching ants" polylines
 * using leaflet-ant-path for visual indication of data flow direction.
 * 
 * Performance optimizations:
 * - Uses useMemo to prevent unnecessary re-renders
 * - Cleans up properly on unmount
 * - Configurable animation speed
 * - Supports preset animation styles
 */
const AnimatedPath = ({
    positions = [],
    color = '#10b981',
    pulseColor = '#ffffff',
    weight = 3,
    opacity = 0.8,
    delay = 800,
    dashArray = [10, 20],
    paused = false,
    reverse = false,
    hardwareAccelerated = true,
    status = 'up', // 'up', 'down', 'unknown'
    type = null, // 'odp', 'client', etc
    animationStyle = null, // Use preset style name (e.g., 'fastPulse', 'dotted')
    enableAnimation = true, // Performance toggle
    tooltip,
    popup,
    onClick,
}) => {
    const map = useMap();
    const pathRef = useRef(null);

    // Memoize options to prevent unnecessary updates
    const options = useMemo(() => {
        // Apply preset style if specified
        const preset = animationStyle ? getAnimationStyle(animationStyle) : null;

        // Use preset values or props
        // Priority: Prop > Preset > Default (handled by prop default)
        const lineDelay = preset?.delay ?? delay;
        const lineDashArray = preset?.dashArray ?? dashArray;
        // Prioritize explicit weight prop over preset
        const lineWeight = weight;
        const lineOpacity = preset?.opacity ?? opacity;
        // Disable animation if enableAnimation is false
        // REMOVED status check for debugging: || (status === 'down' || status === 'offline')
        const linePaused = !enableAnimation || (preset?.paused ?? paused);
        const lineReverse = preset?.reverse ?? reverse;
        // Default hardwareAccelerated to false for better compatibility with custom dash arrays
        const lineHardwareAccelerated = preset?.hardwareAccelerated || false;

        // Status-based colors
        let lineColor = color;
        let linePulseColor = pulseColor;

        // In leaflet-ant-path:
        // color = The dashed/moving part (The "ants")
        // pulseColor = The background path (The "rail")

        // Default Logic (Dark Mode Optimized):
        // Rail (pulseColor) should be dark/dim or the link color but transparent
        // Packet (color) should be the bright status color

        // Override defaults if they are the generic props
        if (pulseColor === '#ffffff' && status === 'up') {
            // If default white background, change to dark rail
            linePulseColor = 'rgba(56, 189, 248, 0.2)'; // Sky-400 with opacity
            lineColor = '#38bdf8'; // Sky-400 (Cyan-like)
        }

        if (status === 'down') {
            lineColor = '#ef4444'; // Red-500 Packet
            linePulseColor = 'rgba(239, 68, 68, 0.2)'; // Red rail
        } else if (type === 'pppoe') {
            lineColor = '#a855f7'; // Purple-500 Packet
            linePulseColor = 'rgba(168, 85, 247, 0.2)'; // Purple rail
        } else if (type === 'odp') {
            lineColor = '#f59e0b'; // Amber-500 Packet
            linePulseColor = 'rgba(245, 158, 11, 0.2)'; // Amber rail
        } else if (type === 'olt') {
            lineColor = '#8b5cf6'; // Violet-500 Packet
            linePulseColor = 'rgba(139, 92, 246, 0.2)'; // Violet rail
        } else if (status === 'unknown') {
            lineColor = '#94a3b8'; // Slate-400 Packet
            linePulseColor = 'rgba(148, 163, 184, 0.2)'; // Slate rail
        } else if (status === 'up' && lineColor === '#10b981') {
            // Fallback for generic 'up' status if not overridden above or custom color
            lineColor = '#06b6d4'; // Cyan-500 (Matches the "Cyber" look better than Green)
            linePulseColor = 'rgba(6, 182, 212, 0.2)';
        }

        const className = preset?.className || '';

        const finalOptions = {
            color: lineColor,
            pulseColor: linePulseColor,
            weight: lineWeight,
            opacity: lineOpacity,
            delay: lineDelay,
            dashArray: lineDashArray,
            paused: linePaused,
            reverse: lineReverse,
            hardwareAccelerated: lineHardwareAccelerated,
            hardwareAccelerated: lineHardwareAccelerated,
            className, // Pass class name to Leaflet layer
            lineCap: preset?.lineCap, // Pass lineCap preference
            tooltip,
            popup,
        };

        console.log('[AnimatedPath] Options:', {
            style: animationStyle,
            paused: linePaused,
            delay: lineDelay,
            dashArray: lineDashArray,
            hwAccel: lineHardwareAccelerated
        });

        return finalOptions;
    }, [color, pulseColor, weight, opacity, delay, dashArray, paused, reverse, hardwareAccelerated, status, type, tooltip, popup, animationStyle, enableAnimation]);

    // Calculate animation parameters
    const totalDashLength = useMemo(() => {
        const arr = Array.isArray(options.dashArray) ? options.dashArray : [10, 20];
        return arr.reduce((a, b) => a + b, 0);
    }, [options.dashArray]);

    const animationName = `flow-${Math.floor(totalDashLength)}-${options.reverse ? 'rev' : 'fwd'}`;
    const uniqueClass = `anim-path-${Math.random().toString(36).substr(2, 9)}`;
    const duration = typeof options.delay === 'number' ?
        // Heuristic: map delay (interval) to duration. 
        // Lower delay = Faster speed = Lower duration.
        // Base: 1000ms delay = 2s duration?
        // particleDots has 100ms. 2s is good visual.
        // Let's rely on manual tuning or a formula.
        // Let's just use 2s as base and scale? 
        // For now, let's allow `duration` in options or fallback to 3s.
        (options.delay < 200 ? '1s' : (options.delay < 500 ? '2s' : '4s'))
        : '3s';

    // Determine overlapping animations
    let additionalAnimation = '';
    if (options.className?.includes('cyber-flow-glow')) {
        additionalAnimation = ', line-pulse 2s infinite alternate';
    } else if (options.className?.includes('pulse-wave-glow')) {
        additionalAnimation = ', line-wave 3s infinite ease-in-out';
    }

    return (
        <>
            {/* Dynamic Style for this path's animation */}
            <style>
                {`
                @keyframes ${animationName} {
                    to {
                        stroke-dashoffset: ${options.reverse ? totalDashLength : -totalDashLength};
                    }
                }
                .${uniqueClass} {
                    stroke-dasharray: ${Array.isArray(options.dashArray) ? options.dashArray.join(',') : options.dashArray};
                    animation: ${animationName} ${duration} linear infinite${additionalAnimation};
                    animation-play-state: ${options.paused ? 'paused' : 'running'};
                    stroke-linecap: ${options.lineCap || 'butt'};
                    stroke-linejoin: round;
                }
                .${uniqueClass}:hover {
                    stroke-width: ${options.weight + 2}px;
                    filter: brightness(1.2);
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
                ref={pathRef}
                positions={positions}
                pathOptions={{
                    color: options.color,
                    weight: options.weight,
                    opacity: options.opacity,
                    className: `${uniqueClass} ${options.className || ''} ${options.paused ? '' : 'animate-flow'}`,
                    fill: false
                }}
                eventHandlers={{
                    click: onClick
                }}
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
