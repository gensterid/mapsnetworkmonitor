import { useState, useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';

/**
 * Custom hook for Server-Sent Events (SSE) connection
 * Provides real-time updates for alerts and other events
 */
export function useSSE() {
    const [isConnected, setIsConnected] = useState(false);
    const [lastEvent, setLastEvent] = useState(null);
    const eventSourceRef = useRef(null);
    const queryClient = useQueryClient();

    const connect = useCallback(() => {
        // Close existing connection if any
        if (eventSourceRef.current) {
            eventSourceRef.current.close();
        }

        // In production, use relative path (empty string) to go through Nginx proxy
        // In development, use localhost:3001
        let apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';
        if (typeof window !== 'undefined' &&
            !window.location.hostname.includes('localhost') &&
            !window.location.hostname.includes('127.0.0.1')) {
            apiUrl = ''; // Use current origin
        }

        const eventSource = new EventSource(`${apiUrl}/api/events`, {
            withCredentials: true
        });

        eventSource.onopen = () => {
            console.log('SSE connected');
            setIsConnected(true);
        };

        eventSource.onerror = (error) => {
            console.error('SSE error:', error);
            setIsConnected(false);
            // Reconnect after 5 seconds
            setTimeout(() => {
                if (eventSourceRef.current?.readyState === EventSource.CLOSED) {
                    connect();
                }
            }, 5000);
        };

        // Handle connection confirmation
        eventSource.addEventListener('connected', (event) => {
            const data = JSON.parse(event.data);
            console.log('SSE connection confirmed:', data);
        });

        // Handle new alert events
        eventSource.addEventListener('new_alert', (event) => {
            const data = JSON.parse(event.data);
            console.log('New alert received:', data);
            setLastEvent(data);

            // Show toast notification
            toast.error(`🚨 ${data.alert?.title || 'New Alert'}`, {
                duration: 5000,
                position: 'top-right',
            });

            // Invalidate alert queries to refresh data
            queryClient.invalidateQueries({ queryKey: ['alerts'] });
            queryClient.invalidateQueries({ queryKey: ['unread-alert-count'] });
        });

        eventSourceRef.current = eventSource;
    }, [queryClient]);

    const disconnect = useCallback(() => {
        if (eventSourceRef.current) {
            eventSourceRef.current.close();
            eventSourceRef.current = null;
            setIsConnected(false);
        }
    }, []);

    useEffect(() => {
        connect();

        // Cleanup on unmount
        return () => {
            disconnect();
        };
    }, [connect, disconnect]);

    return {
        isConnected,
        lastEvent,
        reconnect: connect,
        disconnect,
    };
}

export default useSSE;
