import React, { useEffect, useRef } from 'react';
import { Polyline, Tooltip, Popup } from 'react-leaflet';
import '../map.css';

/**
 * MotionPathRenderer
 * 
 * Renders a connection line with an object moving along it (Motion Path).
 * This component handles the SVG implementation of objects like Orbs, Packets, or Meteors directly.
 */
const MotionPathRenderer = ({
    positions,
    options,
    onClick
}) => {
    const polylineRef = useRef(null);
    const motionElementRef = useRef(null);
    const durationStr = `${options.delay}ms`;

    // Destructure to isolate dependencies
    const {
        motionType, motionColor, reverse, paused, delay
    } = options;

    // Effect 1: Create/Destroy Motion Element (Lifecycle) & Handle Path Sync
    useEffect(() => {
        if (!polylineRef.current) return;

        const layer = polylineRef.current;
        let retryCount = 0;
        const maxRetries = 10;
        let observer = null;

        const cleanup = () => {
            if (motionElementRef.current) {
                if (motionElementRef.current._observer) {
                    motionElementRef.current._observer.disconnect();
                }
                motionElementRef.current.remove();
                motionElementRef.current = null;
            }
        };

        const tryInitialize = () => {
            const pathElement = layer.getElement?.() || layer._path;

            // Wait for path element to be attached to DOM
            if (!pathElement || !pathElement.parentNode) {
                if (retryCount < maxRetries) {
                    retryCount++;
                    setTimeout(tryInitialize, 200);
                }
                return;
            }

            // Create Motion Element (SVG) only if it doesn't exist
            let motionEl = motionElementRef.current;
            if (!motionEl) {
                const ns = "http://www.w3.org/2000/svg";

                // Determine shape based on motionType
                if (motionType === 'orb') {
                    motionEl = document.createElementNS(ns, "circle");
                    motionEl.setAttribute("r", "6");
                    motionEl.setAttribute("class", "motion-element motion-orb");
                } else if (motionType === 'packet') {
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

                pathElement.parentNode.appendChild(motionEl);
                motionElementRef.current = motionEl;
            }

            // Sync Path Data
            const syncPath = () => {
                const d = pathElement.getAttribute('d');
                // OPTIMIZATION: Only update if 'd' actually changed to prevent animation resets/stutter
                if (d && motionElementRef.current) {
                    const currentD = motionElementRef.current.getAttribute('data-d');
                    if (currentD === d) return;

                    motionElementRef.current.setAttribute('data-d', d);
                    motionElementRef.current.style.setProperty('--motion-path-d', `"${d}"`);
                    motionElementRef.current.style.offsetPath = `path("${d}")`;
                }
            };

            syncPath();

            // Observe 'd' attribute changes (zooming/panning)
            observer = new MutationObserver(syncPath);
            observer.observe(pathElement, { attributes: true, attributeFilter: ['d'] });
            motionElementRef.current._observer = observer;
        };

        const timer = setTimeout(tryInitialize, 100);

        return () => {
            clearTimeout(timer);
            cleanup();
        };
    }, [motionType]); // Only recreate if shape type changes

    // Effect 2: Update Styles & Animation State (Without destroying element)
    useEffect(() => {
        const motionEl = motionElementRef.current;
        if (!motionEl) return;

        motionEl.style.setProperty('--motion-duration', `${delay}ms`);
        motionEl.style.fill = motionColor;

        if (reverse) {
            motionEl.classList.add('motion-reverse');
        } else {
            motionEl.classList.remove('motion-reverse');
        }

        if (paused) {
            motionEl.style.animationPlayState = 'paused';
        } else {
            motionEl.style.animationPlayState = 'running';
        }

    }, [motionColor, delay, reverse, paused, motionElementRef.current]); // Dependent on style props

    return (
        <>
            {/* 1. VISUAL RAIL (Thin, Animated or Static) */}
            <Polyline
                ref={polylineRef}
                positions={positions}
                pathOptions={{
                    color: options.color,
                    weight: options.weight,
                    opacity: 0.3,
                    fill: false,
                    lineCap: options.lineCap,
                    lineJoin: options.lineJoin
                }}
                interactive={options.lowPerfMode} // Only interactive in low perf mode (to save nodes)
                eventHandlers={options.lowPerfMode ? (() => {
                    const handlers = {};
                    if (onClick) handlers.click = onClick;
                    if (options.onMouseOver) handlers.mouseover = options.onMouseOver;
                    if (options.onMouseOut) handlers.mouseout = options.onMouseOut;
                    return handlers;
                })() : {}}
            >
                {options.lowPerfMode && (
                    <>
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
                    </>
                )}
            </Polyline>

            {/* 2. INVISIBLE HIT BOX (Wider area for easier hovering, disabled in Low Perf Mode) */}
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
                            <div dangerouslySetInnerHTML={{ __html: options.tooltip }} />
                        </Tooltip>
                    )}
                    {options.popup && (
                        <Popup>
                            <div dangerouslySetInnerHTML={{ __html: options.popup }} />
                        </Popup>
                    )}
                </Polyline>
            )}
        </>
    );
};

export default MotionPathRenderer;
