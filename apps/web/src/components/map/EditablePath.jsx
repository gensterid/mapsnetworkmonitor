import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useMap, Marker, Polyline } from 'react-leaflet';
import L from 'leaflet';
import { createEditHandleIcon } from './DeviceIcon';

/**
 * DraggableWaypoint - A marker that can be dragged with proper React-Leaflet integration
 */
const DraggableWaypoint = ({ position, onDrag, onDragEnd, onContextMenu, icon }) => {
    const markerRef = useRef(null);

    const eventHandlers = useMemo(() => ({
        drag: (e) => {
            const marker = markerRef.current;
            if (marker && onDrag) {
                onDrag(e);
            }
        },
        dragend: () => {
            const marker = markerRef.current;
            if (marker && onDragEnd) {
                const newPos = marker.getLatLng();
                onDragEnd([newPos.lat, newPos.lng]);
            }
        },
        contextmenu: (e) => {
            e.originalEvent.preventDefault();
            if (onContextMenu) onContextMenu();
        },
    }), [onDrag, onDragEnd, onContextMenu]);

    return (
        <Marker
            ref={markerRef}
            position={position}
            icon={icon}
            draggable={true}
            eventHandlers={eventHandlers}
        />
    );
};

import { calculatePathLength } from '@/lib/geo';

const EditablePath = ({
    fromPosition,
    toPosition,
    waypoints = [],
    isEditing = false,
    color = '#3b82f6',
    weight = 3,
    onWaypointsChange,
    onLengthChange,
}) => {
    const map = useMap();
    const [localWaypoints, setLocalWaypoints] = useState(waypoints);

    // Full path including start and end
    const fullPath = useMemo(() => {
        if (!fromPosition || !toPosition) return [];
        return [fromPosition, ...localWaypoints, toPosition];
    }, [fromPosition, toPosition, localWaypoints]);

    // Calculate path length
    useEffect(() => {
        const length = calculatePathLength(fullPath);
        // Only trigger update if length actually changed significantly to avoid loops
        if (onLengthChange) {
            onLengthChange(length);
        }
    }, [fullPath, onLengthChange]);



    // Handle waypoint drag end
    const handleWaypointDragEnd = useCallback(() => {
        if (onWaypointsChange) {
            onWaypointsChange(localWaypoints);
        }
    }, [localWaypoints, onWaypointsChange]);

    // Handle right-click to remove waypoint
    const handleWaypointRightClick = useCallback((index) => {
        setLocalWaypoints(prev => {
            const updated = prev.filter((_, i) => i !== index);
            if (onWaypointsChange) {
                onWaypointsChange(updated);
            }
            return updated;
        });
    }, [onWaypointsChange]);

    // Handle click on line to add waypoint
    const handleLineClick = useCallback((event) => {
        if (!isEditing) return;

        const clickLatLng = event.latlng;
        const newWaypoint = [clickLatLng.lat, clickLatLng.lng];

        // Find the segment where to insert the waypoint
        let insertIndex = 0;
        let minDistance = Infinity;

        for (let i = 0; i < fullPath.length - 1; i++) {
            const start = fullPath[i];
            const end = fullPath[i + 1];

            // Calculate distance from click to line segment
            const distance = L.latLng(clickLatLng).distanceTo(
                L.latLng((start[0] + end[0]) / 2, (start[1] + end[1]) / 2)
            );

            if (distance < minDistance) {
                minDistance = distance;
                insertIndex = i;
            }
        }

        setLocalWaypoints(prev => {
            const updated = [...prev];
            // Adjust index because fullPath includes fromPosition at index 0
            const waypointIndex = insertIndex;
            updated.splice(waypointIndex, 0, newWaypoint);
            if (onWaypointsChange) {
                onWaypointsChange(updated);
            }
            return updated;
        });
    }, [isEditing, fullPath, onWaypointsChange]);

    // Sync local state with props
    useEffect(() => {
        setLocalWaypoints(waypoints);
    }, [waypoints]);

    if (!fromPosition || !toPosition) return null;

    return (
        <>
            {/* Invisible wider click area for editing */}
            {isEditing && (
                <Polyline
                    positions={fullPath}
                    pathOptions={{
                        color: 'transparent',
                        weight: 20, // Wide click area
                        opacity: 0,
                    }}
                    eventHandlers={{
                        click: handleLineClick,
                    }}
                />
            )}

            {/* Main visible path line */}
            <Polyline
                positions={fullPath}
                pathOptions={{
                    color,
                    weight: isEditing ? weight + 2 : weight,
                    opacity: isEditing ? 1 : 0.8,
                    dashArray: isEditing ? '10, 5' : null, // Dashed when editing
                }}
                eventHandlers={{
                    click: handleLineClick,
                }}
            />

            {/* Waypoint handles (only when editing) */}
            {isEditing && localWaypoints.map((pos, index) => (
                <DraggableWaypoint
                    key={`waypoint-${index}-${pos[0]}-${pos[1]}`}
                    position={pos}
                    icon={createEditHandleIcon(false)}
                    onDragEnd={(newPos) => {
                        // Update position immediately and notify parent
                        setLocalWaypoints(prev => {
                            const updated = [...prev];
                            updated[index] = newPos;
                            if (onWaypointsChange) {
                                onWaypointsChange(updated);
                            }
                            return updated;
                        });
                    }}
                    onContextMenu={() => handleWaypointRightClick(index)}
                />
            ))}

            {/* Hint: Click to add waypoint indicator (shown as midpoints when editing) */}
            {isEditing && fullPath.length > 1 && fullPath.slice(0, -1).map((pos, idx) => {
                const next = fullPath[idx + 1];
                const midpoint = [(pos[0] + next[0]) / 2, (pos[1] + next[1]) / 2];
                return (
                    <DraggableWaypoint
                        key={`midpoint-${idx}`}
                        position={midpoint}
                        icon={createEditHandleIcon(true)}
                        onDragEnd={(newPos) => {
                            // Insert waypoint at this midpoint position
                            const newWaypoint = newPos;
                            setLocalWaypoints(prev => {
                                const updated = [...prev];
                                // Calculate correct insert index (account for start position)
                                const insertIdx = idx;
                                updated.splice(insertIdx, 0, newWaypoint);
                                if (onWaypointsChange) {
                                    onWaypointsChange(updated);
                                }
                                return updated;
                            });
                        }}
                    />
                );
            })}
        </>
    );
};

export default EditablePath;
