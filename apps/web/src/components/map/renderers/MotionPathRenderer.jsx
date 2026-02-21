import React, { useEffect, useRef } from 'react';
import { Polyline, Tooltip, Popup, useMap } from 'react-leaflet';
import { sanitizeHtml } from '@/lib/sanitize';
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
    const animationRef = useRef(null);
    const [isVisible, setIsVisible] = React.useState(true);
    const map = useMap();
    const durationStr = `${options.delay}ms`;

    // Destructure to isolate dependencies
    const {
        motionType, motionColor, reverse, paused, delay, lowPerfMode
    } = options;

    // Effect: Viewport Culling
    useEffect(() => {
        if (lowPerfMode) {
            setIsVisible(false);
            return;
        }

        const checkVisibility = Throttled(() => {
            if (!polylineRef.current) return;
            const bounds = polylineRef.current.getBounds();
            const mapBounds = map.getBounds();
            setIsVisible(mapBounds.intersects(bounds));
        }, 500);

        map.on('moveend zoomend', checkVisibility);
        checkVisibility();

        return () => {
            map.off('moveend zoomend', checkVisibility);
        };
    }, [map, lowPerfMode]);

    function Throttled(func, delay) {
        let lastCall = 0;
        return (...args) => {
            const now = new Date().getTime();
            if (now - lastCall < delay) return;
            lastCall = now;
            return func(...args);
        };
    }

    // Effect 1: Create/Destroy Motion Element (Lifecycle) & Handle Path Sync
    useEffect(() => {
        if (!polylineRef.current || !isVisible) {
            cleanup();
            return;
        }

        const layer = polylineRef.current;
        let retryCount = 0;
        const maxRetries = 10;
        let observer = null;

        function cleanup() {
            if (animationRef.current) {
                animationRef.current.cancel();
                animationRef.current = null;
            }
            if (motionElementRef.current) {
                if (motionElementRef.current._observer) {
                    motionElementRef.current._observer.disconnect();
                }
                motionElementRef.current.remove();
                motionElementRef.current = null;
            }
        }

        const tryInitialize = () => {
            const pathElement = layer.getElement?.() || layer._path;

            if (!pathElement || !pathElement.parentNode) {
                if (retryCount < maxRetries) {
                    retryCount++;
                    setTimeout(tryInitialize, 200);
                }
                return;
            }

            let motionEl = motionElementRef.current;
            if (!motionEl) {
                const ns = "http://www.w3.org/2000/svg";

                if (motionType === 'orb') {
                    motionEl = document.createElementNS(ns, "circle");
                    motionEl.setAttribute("r", "5");
                    motionEl.setAttribute("class", "motion-element motion-orb");
                } else if (motionType === 'packet') {
                    motionEl = document.createElementNS(ns, "rect");
                    motionEl.setAttribute("width", "10");
                    motionEl.setAttribute("height", "6");
                    motionEl.setAttribute("rx", "1");
                    motionEl.setAttribute("class", "motion-element motion-packet");
                } else {
                    motionEl = document.createElementNS(ns, "rect");
                    motionEl.setAttribute("width", "25");
                    motionEl.setAttribute("height", "3");
                    motionEl.setAttribute("rx", "1.5");
                    motionEl.setAttribute("class", "motion-element motion-comet");
                }

                pathElement.parentNode.appendChild(motionEl);
                motionElementRef.current = motionEl;
            }

            const syncPath = () => {
                const d = pathElement.getAttribute('d');
                if (d && motionElementRef.current) {
                    const currentD = motionElementRef.current.getAttribute('data-d');
                    if (currentD === d) return;

                    motionElementRef.current.setAttribute('data-d', d);
                    motionElementRef.current.style.offsetPath = `path("${d}")`;
                }
            };

            syncPath();

            observer = new MutationObserver(syncPath);
            observer.observe(pathElement, { attributes: true, attributeFilter: ['d'] });
            motionElementRef.current._observer = observer;

            // Initialize Animation (WAAPI)
            if (motionElementRef.current && !animationRef.current) {
                const keyframes = [
                    { offsetDistance: "0%" },
                    { offsetDistance: "100%" }
                ];
                const timing = {
                    duration: delay || 2000,
                    iterations: Infinity,
                    direction: reverse ? 'reverse' : 'normal',
                    easing: 'linear'
                };
                animationRef.current = motionElementRef.current.animate(keyframes, timing);
                if (paused) animationRef.current.pause();
            }
        };

        const timer = setTimeout(tryInitialize, 100);

        return () => {
            clearTimeout(timer);
            cleanup();
        };
    }, [motionType, isVisible]);

    // Effect 2: Update Styles & Animation State (Without destroying element)
    useEffect(() => {
        const motionEl = motionElementRef.current;
        const animation = animationRef.current;
        if (!motionEl) return;

        if (motionColor) {
            motionEl.style.setProperty('--motion-color', motionColor);
            motionEl.style.fill = motionColor;
        }

        if (animation) {
            animation.playbackRate = 1;
            if (animation.effect) {
                animation.effect.updateTiming({
                    duration: delay || 2000,
                    direction: reverse ? 'reverse' : 'normal'
                });
            }

            if (paused) {
                animation.pause();
            } else {
                animation.play();
            }
        }

        const layer = polylineRef.current;
        const pathElement = layer?.getElement?.() || layer?._path;
        if (pathElement) {
            pathElement.style.animationPlayState = paused ? 'paused' : 'running';
        }

    }, [motionColor, delay, reverse, paused, isVisible]); // Dependent on style props

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

export default MotionPathRenderer;
