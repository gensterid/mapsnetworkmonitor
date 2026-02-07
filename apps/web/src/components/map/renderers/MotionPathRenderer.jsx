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

    // Effect: Handle SVG Motion Path (Object Moving Along Line)
    useEffect(() => {
        if (!polylineRef.current || options.paused) return;

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
    }, [options.motionType, options.motionColor, options.reverse, options.paused, durationStr]);

    return (
        <Polyline
            ref={polylineRef}
            positions={positions}
            pathOptions={{
                color: options.color,
                weight: options.weight,
                opacity: 0.3, // Dim background line for motion paths
                fill: false,
                lineCap: options.lineCap,
                lineJoin: options.lineJoin
            }}
            eventHandlers={onClick ? { click: onClick } : null}
        >
            {/* Tooltips and Popups are passed through children in parent, but here we render them if provided in options */}
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
    );
};

export default MotionPathRenderer;
