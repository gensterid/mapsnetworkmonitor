import React, { useEffect, useRef } from 'react';
import { Polyline, Tooltip, Popup } from 'react-leaflet';
import { sanitizeHtml } from '@/lib/sanitize';
import '../map.css';

/**
 * FlowPathRenderer (WAAPI Implementation)
 * 
 * Renders a connection line with stroke-dashoffset animation.
 * USES WEB ANIMATIONS API instead of CSS Keyframes for better reliability.
 * Used for: Dashed, Neon, CyberFlow, Plasma, etc.
 */
const FlowPathRenderer = ({
    positions,
    options,
    onClick
}) => {
    const polylineRef = useRef(null);

    // Derived values
    const dashArrayValues = Array.isArray(options.dashArray) ? options.dashArray : [10, 20];
    const dashArraySum = dashArrayValues.reduce((a, b) => a + b, 0);
    const dashArrayStr = dashArrayValues.join(', ');

    // Destructure animation-critical props to prevent unnecessary restarts
    const {
        dashArray, delay, paused, reverse, syncArrival, pulseColor, weight, opacity, className, lineCap, lineJoin, color
    } = options;

    // Effect: Apply WAAPI Animation (Only restarts if structural props change)
    useEffect(() => {
        if (!polylineRef.current || paused) return;

        const layer = polylineRef.current;
        const pathElement = layer.getElement?.() || layer._path;

        if (!pathElement) return;

        // 1. Calculate Dash Array & Offset Target
        let finalDashArrayStr = dashArrayStr;
        let finalDashOffsetTarget = dashArraySum * -1;
        let finalDashOffsetStart = 0;

        if (syncArrival) {
            // Force path length to 1000 for consistent timing
            pathElement.setAttribute('pathLength', '1000');

            const basePattern = Array.isArray(dashArray) ? [...dashArray] : [10, 20];
            const dotSize = basePattern[0];
            const gapSize = 1000 - dotSize;

            // Reconstruct dash array for pathLength=1000
            const syncedDashArray = [dotSize, gapSize > 0 ? gapSize : 1000];
            finalDashArrayStr = syncedDashArray.join(', ');

            finalDashOffsetTarget = -1000;
        } else {
            pathElement.removeAttribute('pathLength');
        }

        // 2. Set Static Styles (Initial)
        pathElement.style.strokeDasharray = finalDashArrayStr;
        // pathElement.style.stroke is handled by separate effect to avoid restart

        // 3. Configure Animation Keyframes
        const startOffset = finalDashOffsetStart;
        const endOffset = reverse ? Math.abs(finalDashOffsetTarget) : finalDashOffsetTarget;

        const keyframes = [
            { strokeDashoffset: startOffset },
            { strokeDashoffset: endOffset }
        ];

        const timing = {
            duration: delay || 1000,
            iterations: Infinity,
            easing: 'linear'
        };

        // 4. Trigger Animation via WAAPI
        const animation = pathElement.animate(keyframes, timing);

        // Cleanup
        return () => {
            animation.cancel();
        };

    }, [dashArrayStr, dashArraySum, delay, paused, reverse, syncArrival]); // Removed 'options' and 'color'

    // Effect: Update Color/Weight/Opacity without restarting animation
    useEffect(() => {
        if (!polylineRef.current) return;
        const layer = polylineRef.current;
        const pathElement = layer.getElement?.() || layer._path;
        if (pathElement) {
            pathElement.style.stroke = color;
            pathElement.style.strokeWidth = weight;
            pathElement.style.opacity = opacity;
            pathElement.style.animationPlayState = paused ? 'paused' : 'running';
        }
    }, [color, weight, opacity, paused]);

    return (
        <>
            {/* Background Rail (Optional) */}
            {options.pulseColor !== 'transparent' && (
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

            {/* 2. Foreground Flow Path (Animated) */}
            <Polyline
                ref={polylineRef}
                positions={positions}
                pathOptions={{
                    weight: options.weight,
                    opacity: options.opacity,
                    fill: false,
                    className: options.className || '',
                    lineCap: options.lineCap,
                    lineJoin: options.lineJoin
                }}
                interactive={true}
                eventHandlers={(() => {
                    const handlers = {};
                    if (onClick) handlers.click = onClick;
                    if (options.onMouseOver) handlers.mouseover = options.onMouseOver;
                    if (options.onMouseOut) handlers.mouseout = options.onMouseOut;
                    return handlers;
                })()}
            >
                {options.lowPerfMode && (
                    <>
                        {options.tooltip && (
                            <Tooltip sticky direction="top" className="custom-map-tooltip" opacity={1}>
                                <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(options.tooltip) }} />
                            </Tooltip>
                        )}
                        {options.popup && (
                            <Popup>
                                <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(options.popup) }} />
                            </Popup>
                        )}
                    </>
                )}
            </Polyline>

            {/* 3. INVISIBLE HIT BOX (Wide area for hover) */}
            {!options.lowPerfMode && (
                <Polyline
                    positions={positions}
                    pathOptions={{
                        weight: Math.max(15, options.weight * 3),
                        opacity: 0,
                        fill: false,
                        color: 'transparent'
                    }}
                    eventHandlers={(() => {
                        const handlers = {};
                        if (onClick) handlers.click = onClick;
                        if (options.onMouseOver) handlers.mouseover = options.onMouseOver;
                        if (options.onMouseOut) handlers.mouseout = options.onMouseOut;
                        return handlers;
                    })()}
                >
                    {options.tooltip && (
                        <Tooltip sticky direction="top" className="custom-map-tooltip" opacity={1}>
                            <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(options.tooltip) }} />
                        </Tooltip>
                    )}
                    {options.popup && (
                        <Popup>
                            <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(options.popup) }} />
                        </Popup>
                    )}
                </Polyline>
            )}
        </>
    );
};

export default FlowPathRenderer;
