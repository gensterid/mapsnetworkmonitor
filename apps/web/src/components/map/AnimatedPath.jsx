import React, { useMemo, useRef, useEffect } from 'react';
import { Polyline, Tooltip, Popup } from 'react-leaflet';
import { getAnimationStyle } from './animationStyles';
import './map.css'; // Ensure CSS variables and keyframes are loaded

/**
 * AnimatedPath Component (Optimized v2)
 * 
 * Renders a connection line between two coordinates with animation effects.
 * USES CSS VARIABLES instead of injected <style> tags for performance.
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
    motionColor
}) => {
    // Memoize final options to avoid recalculation on every render
    const options = useMemo(() => {
        const preset = animationStyle ? getAnimationStyle(animationStyle) : null;
        return {
            color: color || preset?.color, // Prioritize prop 'color' (status color) over preset
            pulseColor: pulseColor,
            weight: weight,
            opacity: preset?.opacity ?? opacity,
            delay: preset?.delay ?? delay,
            dashArray: preset?.dashArray ?? dashArray,
            paused: !enableAnimation || (preset?.paused ?? paused),
            reverse: preset?.reverse ?? reverse,
            className: preset?.className || '',
            lineCap: preset?.lineCap || 'butt',
            lineJoin: preset?.lineJoin || 'round',
            syncArrival: preset?.syncArrival || false,
            // Motion Path Options
            useMotionPath: !disableMotionPath && (preset?.useMotionPath || false),
            motionType: motionType || preset?.motionType || 'orb',
            motionColor: motionColor || preset?.color || '#ffffff',
            tooltip,
            popup,
        };
    }, [color, pulseColor, weight, opacity, delay, dashArray, paused, reverse, status, type, tooltip, popup, animationStyle, enableAnimation, motionType, motionColor]);

    const polylineRef = useRef(null);
    const motionElementRef = useRef(null);

    // Derived values
    const dashArrayValues = Array.isArray(options.dashArray) ? options.dashArray : [10, 20];
    const dashArraySum = dashArrayValues.reduce((a, b) => a + b, 0);
    const dashArrayStr = dashArrayValues.join(', ');
    const durationStr = `${options.delay}ms`;

    // Effect: Apply CSS Variables to the Path Element (Lightweight)
    useEffect(() => {
        if (!polylineRef.current || options.useMotionPath) return;

        const layer = polylineRef.current;
        // Access the underlying SVG path element
        const pathElement = layer.getElement?.() || layer._path;

        if (pathElement) {
            // 1. Handle Sync Arrival (PathLength Normalization)
            let finalDashArrayStr = dashArrayStr;
            let finalDashOffsetTarget = dashArraySum * -1;

            if (options.syncArrival) {
                pathElement.setAttribute('pathLength', '1000');
                // Recalculate dash array relative to 1000 units
                const basePattern = Array.isArray(options.dashArray) ? [...options.dashArray] : [10, 20];
                const dotSize = basePattern[0];
                const gapSize = 1000 - dotSize;
                // Simple pattern: dot + rest is gap
                const syncedDashArray = [dotSize, gapSize > 0 ? gapSize : 1000];
                finalDashArrayStr = syncedDashArray.join(', ');
                finalDashOffsetTarget = -1000;
            } else {
                pathElement.removeAttribute('pathLength');
            }

            // 2. Set CSS Variables directly on the element style
            // This avoids creating unique classes and style tags
            pathElement.style.setProperty('--dash-array', finalDashArrayStr);
            pathElement.style.setProperty('--dash-offset-target', options.reverse ? Math.abs(finalDashOffsetTarget) : finalDashOffsetTarget);
            pathElement.style.setProperty('--anim-duration', durationStr);
            pathElement.style.setProperty('--anim-color', options.color);
        }
    }, [options, dashArrayStr, dashArraySum, durationStr]);

    // Effect: Handle SVG Motion Path (Object Moving Along Line)
    // ONLY runs if useMotionPath is true AND animation is enabled
    useEffect(() => {
        if (!options.useMotionPath || !polylineRef.current || options.paused) return;

        const layer = polylineRef.current;

        // Small timeout to ensure DOM is ready and reduce blocking
        const timer = setTimeout(() => {
            const pathElement = layer.getElement?.() || layer._path;
            if (!pathElement || !pathElement.parentNode) return;

            // Create Motion Element (SVG) only if it doesn't exist
            let motionEl = motionElementRef.current;
            if (!motionEl) {
                const ns = "http://www.w3.org/2000/svg";

                // Determine shape
                if (options.motionType === 'orb') {
                    motionEl = document.createElementNS(ns, "circle");
                    motionEl.setAttribute("r", "6");
                    motionEl.setAttribute("class", "motion-element motion-orb");
                } else if (options.motionType === 'packet') {
                    motionEl = document.createElementNS(ns, "rect");
                    motionEl.setAttribute("width", "10");
                    motionEl.setAttribute("height", "6");
                    motionEl.setAttribute("rx", "2");
                    motionEl.setAttribute("class", "motion-element motion-packet");
                } else {
                    motionEl = document.createElementNS(ns, "rect");
                    motionEl.setAttribute("width", "20");
                    motionEl.setAttribute("height", "4");
                    motionEl.setAttribute("rx", "2");
                    motionEl.setAttribute("class", "motion-element motion-comet");
                }

                // Set styles
                motionEl.style.setProperty('--motion-duration', durationStr);
                motionEl.style.fill = options.motionColor;

                if (options.reverse) {
                    motionEl.classList.add('motion-reverse');
                }

                pathElement.parentNode.appendChild(motionEl);
                motionElementRef.current = motionEl;
            }

            // Sync Path Data
            const syncPath = () => {
                const d = pathElement.getAttribute('d');
                if (d && motionElementRef.current) {
                    motionElementRef.current.style.setProperty('--motion-path-d', `"${d}"`);
                    motionElementRef.current.style.offsetPath = `path("${d}")`;
                }
            };

            syncPath();

            // Observe 'd' attribute changes (zooming/panning)
            const observer = new MutationObserver(syncPath);
            observer.observe(pathElement, { attributes: true, attributeFilter: ['d'] });

            // Cleanup observer on unmount
            motionElementRef.current._observer = observer;
        }, 100); // 100ms delay to defer heavy work

        return () => {
            clearTimeout(timer);
            if (motionElementRef.current) {
                if (motionElementRef.current._observer) {
                    motionElementRef.current._observer.disconnect();
                }
                motionElementRef.current.remove();
                motionElementRef.current = null;
            }
        };
    }, [options.useMotionPath, options.motionType, options.motionColor, options.reverse, options.paused, durationStr]);

    return (
        <>
            {/* Background Rail - Only render if not transparent and NOT in Low Perf Mode (disableMotionPath) */}
            {options.pulseColor !== 'transparent' && !disableMotionPath && (
                <Polyline
                    positions={positions}
                    pathOptions={{
                        color: options.pulseColor || options.color,
                        weight: options.weight,
                        opacity: 0.5,
                        className: options.className ? `${options.className}-rail` : ''
                    }}
                />
            )}

            {/* Foreground Path */}
            <Polyline
                ref={polylineRef}
                positions={positions}
                pathOptions={{
                    color: options.color,
                    weight: options.weight,
                    // Hide line if using motion object OR depend on opacity
                    opacity: options.useMotionPath ? 0 : options.opacity,
                    // Use generic 'animated-line' class
                    className: options.useMotionPath
                        ? ''
                        : `animated-line ${options.className || ''} ${options.paused ? 'paused' : ''} ${options.reverse ? 'reverse' : ''}`,
                    fill: false,
                    lineCap: options.lineCap,
                    lineJoin: options.lineJoin
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
