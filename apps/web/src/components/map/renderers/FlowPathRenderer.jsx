import React, { useEffect, useRef } from 'react';
import { Polyline, Tooltip, Popup } from 'react-leaflet';
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

    // Effect: Apply WAAPI Animation
    useEffect(() => {
        if (!polylineRef.current || options.paused) return;

        const layer = polylineRef.current;
        const pathElement = layer.getElement?.() || layer._path;

        if (!pathElement) return;

        // 1. Calculate Dash Array & Offset Target
        let finalDashArrayStr = dashArrayStr;
        let finalDashOffsetTarget = dashArraySum * -1;
        let finalDashOffsetStart = 0;

        if (options.syncArrival) {
            // Force path length to 1000 for consistent timing
            pathElement.setAttribute('pathLength', '1000');

            const basePattern = Array.isArray(options.dashArray) ? [...options.dashArray] : [10, 20];
            const dotSize = basePattern[0];
            const gapSize = 1000 - dotSize;

            // Reconstruct dash array for pathLength=1000
            const syncedDashArray = [dotSize, gapSize > 0 ? gapSize : 1000];
            finalDashArrayStr = syncedDashArray.join(', ');

            finalDashOffsetTarget = -1000;
        } else {
            pathElement.removeAttribute('pathLength');
        }

        // 2. Set Static Styles
        pathElement.style.strokeDasharray = finalDashArrayStr;
        pathElement.style.stroke = options.color;

        // 3. Configure Animation Keyframes
        const startOffset = finalDashOffsetStart;
        const endOffset = options.reverse ? Math.abs(finalDashOffsetTarget) : finalDashOffsetTarget;

        const keyframes = [
            { strokeDashoffset: startOffset },
            { strokeDashoffset: endOffset }
        ];

        const timing = {
            duration: options.delay || 1000,
            iterations: Infinity,
            easing: 'linear'
        };

        // 4. Trigger Animation via WAAPI
        const animation = pathElement.animate(keyframes, timing);

        // Cleanup
        return () => {
            animation.cancel();
        };

    }, [options, dashArrayStr, dashArraySum]);

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

            {/* Foreground Path */}
            <Polyline
                ref={polylineRef}
                positions={positions}
                pathOptions={{
                    weight: options.weight,
                    opacity: options.opacity,
                    fill: false,
                    className: options.className || '', // Still use className for filters (glow/neon)
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

export default FlowPathRenderer;
