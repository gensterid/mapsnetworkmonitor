import React, { useEffect, useRef, useMemo } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet-ant-path';
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
        // Disable animation if enableAnimation is false (for performance)
        // Also pause if status is 'down' or 'offline' to prevent flickering
        const linePaused = !enableAnimation || (preset?.paused ?? paused) || (status === 'down' || status === 'offline');
        const lineReverse = preset?.reverse ?? reverse;
        const lineHardwareAccelerated = preset?.hardwareAccelerated ?? hardwareAccelerated;

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
            className, // Pass class name to Leaflet layer
            tooltip,
            popup,
        };
    }, [color, pulseColor, weight, opacity, delay, dashArray, paused, reverse, hardwareAccelerated, status, type, tooltip, popup, animationStyle, enableAnimation]);

    useEffect(() => {
        if (!map || positions.length < 2) return;

        // Create the ant path
        // @ts-ignore - leaflet-ant-path types
        const antPath = L.polyline.antPath(positions, options);

        if (onClick) {
            antPath.on('click', onClick);
        }

        // Add Tooltip and Popup
        if (options.tooltip) {
            antPath.bindTooltip(options.tooltip, { sticky: true, direction: 'top', className: 'custom-map-tooltip', opacity: 1 });
        }
        if (options.popup) {
            antPath.bindPopup(options.popup);
        }

        antPath.addTo(map);
        pathRef.current = antPath;

        return () => {
            if (pathRef.current) {
                map.removeLayer(pathRef.current);
                pathRef.current = null;
            }
        };
    }, [map, positions, options, onClick]);

    // Update path when options change
    useEffect(() => {
        if (pathRef.current) {
            pathRef.current.setStyle({
                color: options.color,
                pulseColor: options.pulseColor,
                weight: options.weight,
                opacity: options.opacity,
            });
        }
    }, [options]);

    return null;
};

export default AnimatedPath;
