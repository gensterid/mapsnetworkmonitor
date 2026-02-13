import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet-ant-path';

const AntPath = ({ positions, options, tooltip, popup, onClick, onMouseOver, onMouseOut }) => {
    const map = useMap();
    const pathRef = useRef(null);

    useEffect(() => {
        if (!positions || positions.length === 0) return;

        // Create AntPath instance
        // L.polyline.antPath(latlngs, options)
        const instance = L.polyline.antPath(positions, {
            "use": L.polyline,
            "delay": options.delay || 1000,
            "dashArray": options.dashArray || [10, 20],
            "weight": options.weight || 3,
            "opacity": options.opacity !== undefined ? options.opacity : 0.5,
            "color": options.color || "#000000",
            "pulseColor": options.pulseColor || "#FFFFFF",
            "paused": options.paused || false,
            "reverse": options.reverse || false,
            "hardwareAccelerated": options.hardwareAccelerated || false
        });

        // Bind events
        if (onClick) {
            instance.on('click', onClick);
        }
        if (onMouseOver) {
            instance.on('mouseover', onMouseOver);
        }
        if (onMouseOut) {
            instance.on('mouseout', onMouseOut);
        }

        // Bind Tooltip
        if (tooltip) {
            instance.bindTooltip(tooltip, {
                sticky: true,
                direction: 'top',
                className: 'custom-map-tooltip', // Re-use existing tooltip class
                opacity: 1
            });
        }

        // Bind Popup
        if (popup) {
            instance.bindPopup(popup);
        }

        // Add to map
        instance.addTo(map);
        pathRef.current = instance;

        // Cleanup
        return () => {
            if (pathRef.current) {
                map.removeLayer(pathRef.current);
            }
        };
    }, [map, positions, options, tooltip, popup, onClick, onMouseOver, onMouseOut]); // Re-create if props change significantly

    return null; // This component handles its own rendering via Leaflet API
};

export default AntPath;
