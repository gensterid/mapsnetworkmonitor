import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { toast } from 'react-hot-toast';

// Singleton socket instance
let socket = null;

export const getSocket = () => {
    if (!socket) {
        // Connect to the same host as the API
        // Vite proxy handles /api, but socket.io needs explicit URL if on different port in dev
        // In production (same origin), it works automatically.
        // For this setup: 
        const envUrl = import.meta.env.VITE_API_URL || '';
        const url = envUrl.startsWith('http') ? envUrl : (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3001');

        socket = io(url, {
            path: '/socket.io',
            withCredentials: true,
            transports: ['websocket', 'polling'], // Prefer WebSocket
            reconnectionAttempts: 5,
        });

        socket.on('connect', () => {
            console.log('🟢 Connected to WebSocket');
        });

        socket.on('connect_error', (err) => {
            console.error('🔴 WebSocket connection error:', err);
        });
    }
    return socket;
};

/**
 * Hook to manage real-time traffic subscription
 */
export const useRealtimeTraffic = (routerId, isEnabled) => {
    const [traffic, setTraffic] = useState(null);
    const [isConnected, setIsConnected] = useState(false);
    const socketRef = useRef(null);

    useEffect(() => {
        if (!isEnabled || !routerId) {
            setTraffic(null);
            return;
        }

        const socket = getSocket();
        socketRef.current = socket;

        const onTrafficUpdate = (payload) => {
            if (payload.routerId === routerId) {
                // Determine if we are connected based on receiving data
                setIsConnected(true);
                setTraffic(payload.data);
            }
        };

        const onDisconnect = () => {
            setIsConnected(false);
        };

        // Listen for events
        socket.on('traffic_update', onTrafficUpdate);
        socket.on('disconnect', onDisconnect);

        // Subscribe to room
        socket.emit('subscribe_traffic', routerId);
        setIsConnected(true);

        return () => {
            // Cleanup
            socket.off('traffic_update', onTrafficUpdate);
            socket.off('disconnect', onDisconnect);
            socket.emit('unsubscribe_traffic', routerId);
            setIsConnected(false);
        };
    }, [routerId, isEnabled]);

    return { traffic, isConnected };
};

/**
 * Hook to manage real-time traffic for ALL routers (Global Map)
 */
export const useAllRoutersTraffic = (routers, isEnabled) => {
    const [allTraffic, setAllTraffic] = useState({});
    const socketRef = useRef(null);

    useEffect(() => {
        if (!isEnabled || !routers || routers.length === 0) {
            setAllTraffic(prev => Object.keys(prev).length === 0 ? prev : {});
            return;
        }

        const socket = getSocket();
        socketRef.current = socket;

        const onTrafficUpdate = (payload) => {
            const { routerId, data } = payload;
            if (!routerId || !data) return;

            setAllTraffic(prev => {
                const newTraffic = { ...prev };
                // Prefix keys with routerId to prevent collisions
                Object.entries(data).forEach(([iface, stats]) => {
                    newTraffic[`${routerId}:${iface}`] = stats;
                });
                return newTraffic;
            });
        };

        // Subscribe to all
        routers.forEach(r => {
            socket.emit('subscribe_traffic', r.id);
        });

        socket.on('traffic_update', onTrafficUpdate);

        return () => {
            socket.off('traffic_update', onTrafficUpdate);
            routers.forEach(r => {
                socket.emit('unsubscribe_traffic', r.id);
            });
        };
    }, [routers, isEnabled]);

    return allTraffic;
};
