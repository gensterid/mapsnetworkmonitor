import React, { useMemo } from 'react';
import { getAnimationStyle } from './animationStyles';
import MotionPathRenderer from './renderers/MotionPathRenderer';
import FlowPathRenderer from './renderers/FlowPathRenderer';
import './map.css'; // Ensure CSS variables and keyframes are loaded

/**
 * AnimatedPath Component (Modular v3)
 * 
 * "Smart Component" that delegates rendering to specialized sub-components:
 * 1. FlowPathRenderer: for stroke-based animations (Dashed, Neon, etc.) - Uses WAAPI
 * 2. MotionPathRenderer: for object-based animations (Orb, Packet, Meteor) - Uses SVG Motion
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
    onClick,
    tooltip,
    popup,
    enableAnimation = true,
    disableMotionPath = false, // New prop to force disable motion path (for Low Perf mode)
    motionType,
    motionColor,
    onMouseOver,
    onMouseOut
}) => {
    // Memoize final options to avoid recalculation on every render
    const options = useMemo(() => {
        const preset = animationStyle ? getAnimationStyle(animationStyle) : null;
        return {
            color: color || preset?.color, // Prioritize prop 'color' (status color) over preset
            pulseColor: pulseColor,
            weight: weight,
            // scaling logic: use preset opacity if available, multiplied by global opacity
            opacity: preset?.opacity ?? opacity,
            delay: preset?.delay ?? delay,
            dashArray: preset?.dashArray ?? dashArray,
            paused: !enableAnimation || (preset?.paused ?? paused),
            reverse: preset?.reverse ?? reverse,
            className: preset?.className || '',
            lineCap: preset?.lineCap || 'butt',
            lineJoin: preset?.lineJoin || 'round',
            syncArrival: preset?.syncArrival || false,
            // Motion Path Options - Respect preset even if globally disabled IF it's an explicit motion style
            useMotionPath: preset?.useMotionPath ? (!disableMotionPath || preset.useMotionPath) : false,
            motionType: motionType || preset?.motionType || 'orb',
            motionColor: motionColor || preset?.color || color || '#ffffff',
            tooltip,
            popup,
            onMouseOver,
            onMouseOut
        };
    }, [color, pulseColor, weight, opacity, delay, dashArray, paused, reverse, status, type, tooltip, popup, animationStyle, enableAnimation, motionType, motionColor, onMouseOver, onMouseOut]);

    // Render appropriate renderer based on 'useMotionPath' flag
    if (options.useMotionPath) {
        return (
            <MotionPathRenderer
                positions={positions}
                options={options}
                onClick={onClick}
            />
        );
    }

    return (
        <FlowPathRenderer
            positions={positions}
            options={options}
            onClick={onClick}
        />
    );
};

export default AnimatedPath;
