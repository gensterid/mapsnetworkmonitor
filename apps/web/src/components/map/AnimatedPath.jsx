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
        const linePaused = !enableAnimation || (preset?.paused ?? paused);
        const lineReverse = preset?.reverse ?? reverse;

        // Status-based colors
        let lineColor = color;
        let linePulseColor = pulseColor;

        if (status === 'down') {
            lineColor = '#ef4444';
            linePulseColor = '#fecaca';
        } else if (type === 'pppoe') {
            lineColor = '#9333ea'; // Purple-600
            linePulseColor = '#c084fc'; // Purple-400
        } else if (type === 'odp') {
            lineColor = '#f59e0b'; // Orange-500
            linePulseColor = '#fcd34d'; // Orange-200
        } else if (type === 'olt') {
            lineColor = '#8b5cf6'; // Violet-500
            linePulseColor = '#ddd6fe'; // Violet-200
        } else if (status === 'unknown') {
            lineColor = '#64748b';
            linePulseColor = '#94a3b8';
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
            hardwareAccelerated,
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
