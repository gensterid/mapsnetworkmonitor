import React, { useState, useEffect } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { DARK_MAP_STYLES, SATELLITE_DARK_STYLES } from './MapStyles';

// Component to add Google Maps Layer
const GoogleMapsLayer = ({ type = 'hybrid', apiKey, onLoaded }) => {
    const map = useMap();
    const [scriptLoaded, setScriptLoaded] = useState(() => !!window.google?.maps);

    useEffect(() => {
        if (!apiKey) return;

        if (window.google?.maps) {
            if (!scriptLoaded) setScriptLoaded(true);
            onLoaded?.();
            return;
        }

        const existingScript = document.querySelector('script[src*="maps.googleapis.com"]');
        if (existingScript) {
            const checkLoaded = setInterval(() => {
                if (window.google?.maps) {
                    setScriptLoaded(true);
                    onLoaded?.();
                    clearInterval(checkLoaded);
                }
            }, 100);
            return () => clearInterval(checkLoaded);
        }

        const script = document.createElement('script');
        script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&loading=async`;
        script.async = true;
        script.defer = true;
        script.onload = () => {
            setScriptLoaded(true);
            onLoaded?.();
            // Important: Don't remove the script tag so it stays in browser cache
        };
        document.head.appendChild(script);
    }, [apiKey, scriptLoaded, onLoaded]);

    useEffect(() => {
        if (!scriptLoaded || !L.gridLayer.googleMutant) return;

        try {
            const layerOptions = {
                type: type === 'dark' ? 'roadmap' : (type === 'satellite_dark' ? 'hybrid' : type),
            };

            // Apply styles if dark mode or satellite dark
            if (type === 'dark') {
                layerOptions.styles = DARK_MAP_STYLES;
            } else if (type === 'satellite_dark') {
                layerOptions.styles = SATELLITE_DARK_STYLES;
            }

            const googleLayer = L.gridLayer.googleMutant(layerOptions);
            googleLayer.addTo(map);
            return () => {
                if (map.hasLayer(googleLayer)) {
                    map.removeLayer(googleLayer);
                }
            };
        } catch (e) {
            console.error("Failed to init google layer", e);
        }
    }, [map, type, scriptLoaded]);

    return null;
};

// Prevent re-renders of the layer component itself unless props change
const MemoizedGoogleMapsLayer = React.memo(GoogleMapsLayer);

export default MemoizedGoogleMapsLayer;
export { GoogleMapsLayer };
