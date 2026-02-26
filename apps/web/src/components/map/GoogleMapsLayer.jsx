import React, { useState, useEffect } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { DARK_MAP_STYLES, SATELLITE_DARK_STYLES } from './MapStyles';

// Component to add Google Maps Layer
const GoogleMapsLayer = ({ type = 'hybrid', apiKey, onLoaded, onError }) => {
    const map = useMap();
    const [scriptLoaded, setScriptLoaded] = useState(() => !!window.google?.maps);

    useEffect(() => {
        // Only load if apiKey is valid and script isn't already loaded
        const invalidKeys = ['undefined', 'null', 'INVALID_KEY', 'YOUR_API_KEY', 'placeholder'];
        const isValidKey = apiKey &&
            !invalidKeys.includes(apiKey) &&
            apiKey.trim().length > 10;

        if (!isValidKey || window.google?.maps) {
            if (window.google?.maps && !scriptLoaded) {
                setScriptLoaded(true);
                onLoaded?.();
            }
            return;
        }

        // Catch authentication failures from Google
        window.gm_authFailure = () => {
            console.error("Google Maps authentication failed! Please check your API Key.");
            setScriptLoaded(false);
            onError?.("AUTH_FAILURE");
        };

        if (!isValidKey) {
            onError?.("INVALID_KEY");
            return;
        }

        const existingScript = document.querySelector('script[src*="maps.googleapis.com"]');
        if (existingScript) {
            const scriptUrl = existingScript.getAttribute('src') || '';
            const keyInScript = scriptUrl.match(/key=([^&]*)/)?.[1];

            if (keyInScript === apiKey) {
                if (window.google?.maps) {
                    setScriptLoaded(true);
                    onLoaded?.();
                } else {
                    const handleLoad = () => {
                        setScriptLoaded(true);
                        onLoaded?.();
                    };
                    existingScript.addEventListener('load', handleLoad);
                    return () => existingScript.removeEventListener('load', handleLoad);
                }
                return;
            } else {
                // Key mismatch! Remove old script to load new key
                console.log("API Key changed or mismatch. Reloading Google Maps script...");
                existingScript.remove();
                if (window.google) delete window.google.maps; // Try to clean up
            }
        }

        const script = document.createElement('script');
        script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&loading=async&libraries=places,geometry`;
        script.async = true;
        script.defer = true;
        script.onload = () => {
            setScriptLoaded(true);
            onLoaded?.();
        };
        script.onerror = () => {
            console.error("Google Maps script failed to load.");
            onError?.("SCRIPT_LOAD_ERROR");
        };
        document.head.appendChild(script);
    }, [apiKey, onLoaded]);

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
