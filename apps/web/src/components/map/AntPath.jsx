import { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet-ant-path';

/**
 * AntPath — Leaflet animated dashed line.
 *
 * Per code-review (commit 572976a follow-up): destructure `options` ke
 * primitive deps. Sebelumnya `options` di useEffect deps → object identity
 * flap per parent render → effect re-fire → Leaflet layer destroyed +
 * recreated tiap parent re-render. Visual flash + cost.
 *
 * Fix: spread options ke variables, useEffect depends on primitive values
 * (delay, weight, dst.) — granular reactivity. Layer hanya recreate kalau
 * primitive value actually berubah.
 */
const AntPath = ({ positions, options, tooltip, popup, onClick, onMouseOver, onMouseOut }) => {
    const map = useMap();
    const pathRef = useRef(null);

    // Destructure dengan defaults supaya useEffect deps array isi primitive
    // — bukan object reference. Layer recreate hanya kalau actual value ganti.
    const delay = options?.delay ?? 1000;
    const dashArray = options?.dashArray; // array — accept object identity flap di sini
    const weight = options?.weight ?? 3;
    const opacity = options?.opacity ?? 0.5;
    const color = options?.color ?? '#000000';
    const pulseColor = options?.pulseColor ?? '#FFFFFF';
    const paused = options?.paused ?? false;
    const reverse = options?.reverse ?? false;
    const hardwareAccelerated = options?.hardwareAccelerated ?? false;

    useEffect(() => {
        if (!positions || positions.length === 0) return;

        const instance = L.polyline.antPath(positions, {
            use: L.polyline,
            delay,
            dashArray: dashArray || [10, 20],
            weight,
            opacity,
            color,
            pulseColor,
            paused,
            reverse,
            hardwareAccelerated,
        });

        if (onClick) instance.on('click', onClick);
        if (onMouseOver) instance.on('mouseover', onMouseOver);
        if (onMouseOut) instance.on('mouseout', onMouseOut);

        if (tooltip) {
            instance.bindTooltip(tooltip, {
                sticky: true,
                direction: 'top',
                className: 'custom-map-tooltip',
                opacity: 1,
            });
        }
        if (popup) instance.bindPopup(popup);

        instance.addTo(map);
        pathRef.current = instance;

        return () => {
            if (pathRef.current) {
                map.removeLayer(pathRef.current);
            }
        };
    }, [
        map,
        positions,
        delay,
        dashArray,
        weight,
        opacity,
        color,
        pulseColor,
        paused,
        reverse,
        hardwareAccelerated,
        tooltip,
        popup,
        onClick,
        onMouseOver,
        onMouseOut,
    ]);

    return null;
};

export default AntPath;
