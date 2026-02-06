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
    // Stable ID for this component instance
    const [uuid] = useState(() => Math.random().toString(36).substr(2, 9));

    // Memoize final options
    const options = useMemo(() => {
        const preset = animationStyle ? getAnimationStyle(animationStyle) : null;
        return {
            color: preset?.color || color,
            pulseColor: pulseColor,
            weight: weight,
            opacity: preset?.opacity ?? opacity,
            delay: preset?.delay ?? delay,
            dashArray: preset?.dashArray ?? dashArray,
            paused: !enableAnimation || (preset?.paused ?? paused),
            reverse: preset?.reverse ?? reverse,
            className: preset?.className || '',
            lineCap: preset?.lineCap || 'butt',
            syncArrival: preset?.syncArrival || false,
            // New Motion Path Options
            useMotionPath: preset?.useMotionPath || false,
            motionType: props.motionType || preset?.motionType || 'orb', // Allow prop override
            motionColor: props.motionColor || preset?.color || '#ffffff', // Allow prop override
            tooltip,
            popup,
        };
    }, [color, pulseColor, weight, opacity, delay, dashArray, paused, reverse, status, type, tooltip, popup, animationStyle, enableAnimation]);

    const uniqueClass = `anim-path-${uuid}`;
    const duration = `${options.delay}ms`;
    const dashArrayValues = Array.isArray(options.dashArray) ? options.dashArray : [10, 20];
    const dashArrayStr = dashArrayValues.join(', ');
    const dashArraySum = dashArrayValues.reduce((a, b) => a + b, 0);
    const animName = `dyn-flow-${dashArraySum}${options.reverse ? '-rev' : ''}`;

    const polylineRef = React.useRef(null);
    const motionElementRef = React.useRef(null);

    // Effect: Handle standard CSS animations (Dash Offset)
    React.useEffect(() => {
        if (!polylineRef.current || options.useMotionPath) return; // Skip if using Motion Path

        const layer = polylineRef.current;
        const pathElement = layer.getElement?.() || layer._path;

        if (pathElement) {
            let finalDashArrayStr = dashArrayStr;
            let finalDashArraySum = dashArraySum;
            const uniqueAnimName = `dyn-flow-${uuid}`;

            if (options.syncArrival) {
                pathElement.setAttribute('pathLength', '1000');
                const basePattern = Array.isArray(options.dashArray) ? [...options.dashArray] : [4, 1000];
                const dotSize = basePattern[0];
                const gapSize = 1000 - dotSize;
                const syncedDashArray = [dotSize, gapSize > 0 ? gapSize : 1000];
                finalDashArrayStr = syncedDashArray.join(', ');
                finalDashArraySum = 1000;
            } else {
                pathElement.removeAttribute('pathLength');
            }

            if (isNaN(finalDashArraySum)) finalDashArraySum = dashArraySum || 1000;

            const styleId = `style-path-${uuid}`;
            let styleSheet = document.getElementById(styleId);
            if (!styleSheet) {
                styleSheet = document.createElement("style");
                styleSheet.id = styleId;
                document.head.appendChild(styleSheet);
            }

            styleSheet.innerText = `
                @keyframes ${uniqueAnimName} {
                    from { stroke-dashoffset: 0; }
                    to { stroke-dashoffset: -${finalDashArraySum}; }
                }
                @keyframes ${uniqueAnimName}-rev {
                    from { stroke-dashoffset: 0; }
                    to { stroke-dashoffset: ${finalDashArraySum}; }
                }
                .anim-path-${uuid} {
                    stroke-dasharray: ${finalDashArrayStr} !important;
                    animation-name: ${uniqueAnimName}${options.reverse ? '-rev' : ''} !important;
                    animation-duration: ${duration} !important;
                    animation-timing-function: linear !important;
                    animation-iteration-count: infinite !important;
                    animation-play-state: ${options.paused ? 'paused' : 'running'} !important;
                    stroke-linecap: ${options.lineCap} !important;
                    stroke-linejoin: ${options.lineJoin} !important;
                    will-change: stroke-dashoffset;
                    stroke: ${options.color} !important;
                }
            `;
        }
        return () => {
            const styleSheet = document.getElementById(`style-path-${uuid}`);
            if (styleSheet) styleSheet.remove();
        };
    }, [dashArrayStr, duration, animName, options, dashArraySum, uuid, positions, animationStyle]);

    // Effect: Handle SVG Motion Path (Object Moving Along Line)
    React.useEffect(() => {
        if (!options.useMotionPath || !polylineRef.current) return;

        const layer = polylineRef.current;
        // Wait for next tick to ensure layer is rendered
        setTimeout(() => {
            const pathElement = layer.getElement?.() || layer._path;
            if (!pathElement || !pathElement.parentNode) return;

            // Create Motion Element (SVG)
            let motionEl = motionElementRef.current;
            if (!motionEl) {
                // Determine shape based on motionType
                if (options.motionType === 'orb') {
                    motionEl = document.createElementNS("http://www.w3.org/2000/svg", "circle");
                    motionEl.setAttribute("r", "4");
                    motionEl.setAttribute("class", "motion-element motion-orb");
                } else if (options.motionType === 'packet') {
                    motionEl = document.createElementNS("http://www.w3.org/2000/svg", "rect");
                    motionEl.setAttribute("width", "12");
                    motionEl.setAttribute("height", "6");
                    motionEl.setAttribute("rx", "2");
                    motionEl.setAttribute("class", "motion-element motion-packet");
                } else {
                    // Default or Comet
                    motionEl = document.createElementNS("http://www.w3.org/2000/svg", "rect");
                    motionEl.setAttribute("width", "20");
                    motionEl.setAttribute("height", "4");
                    motionEl.setAttribute("rx", "2");
                    motionEl.setAttribute("class", "motion-element motion-comet");
                }

                // Set Custom Properties for Animation
                motionEl.style.setProperty('--motion-duration', duration);
                // Apply dynamic color
                motionEl.style.fill = options.motionColor;
                motionEl.style.stroke = options.motionColor; // For some shapes

                if (options.reverse) {
                    motionEl.classList.add('motion-reverse');
                }

                // Append to the same SVG container as the path
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

            // Initial Sync
            syncPath();

            // Observe changes to 'd' attribute (handle zoom/pan updates)
            const observer = new MutationObserver(syncPath);
            observer.observe(pathElement, { attributes: true, attributeFilter: ['d'] });

            return () => {
                observer.disconnect();
                if (motionElementRef.current) {
                    motionElementRef.current.remove();
                    motionElementRef.current = null;
                }
            };
        }, 50);

    }, [options, duration, positions]); // Re-run if path or options change

    return (
        <>
            {/* Background Rail */}
            <Polyline
                positions={positions}
                pathOptions={{
                    color: options.pulseColor || options.color,
                    weight: options.weight,
                    opacity: 0.2, // Low opacity rail for motion path
                    className: options.className ? `${options.className}-rail` : ''
                }}
            />

            {/* Foreground Path (Invisible if Motion Path, Visible if Standard) */}
            <Polyline
                ref={polylineRef}
                positions={positions}
                pathOptions={{
                    color: options.color,
                    weight: options.weight,
                    opacity: options.useMotionPath ? 0 : options.opacity, // Hide line if using motion object
                    dashArray: options.useMotionPath ? null : dashArrayStr, // No dashes for motion path
                    className: options.useMotionPath ? '' : `ans-path-base ${uniqueClass} ${options.className || ''} ${options.paused ? 'ans-paused' : ''}`,
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
