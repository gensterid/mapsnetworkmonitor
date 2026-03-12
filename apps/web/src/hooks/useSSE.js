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
        // Use relative path to go through Vite proxy in dev or current origin in prod
        // This ensures the connection is persistent and uses correct session cookies
        const apiUrl = '';

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
            
            // Reconnect after 5 seconds if connection is lost
            // We use a timeout to prevent immediate spamming of the server
            setTimeout(() => {
                // If the app is still mounted and the source is closed, try to reconnect
                if (eventSourceRef.current && 
                    (eventSourceRef.current.readyState === EventSource.CLOSED)) {
                    console.log('🔄 Reconfirming SSE connection...');
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

        // Handle map update events (manual edits, deletions, additions)
        eventSource.addEventListener('map_update', (event) => {
            const data = JSON.parse(event.data);
            console.log('Map update received:', data);

            // Invalidate all map-related data
            queryClient.invalidateQueries({ queryKey: ['routers'] });
            queryClient.invalidateQueries({ queryKey: ['netwatch-all'] });
            queryClient.invalidateQueries({ queryKey: ['pppoe-all'] });
            queryClient.invalidateQueries({ queryKey: ['onus-map'] });

            // Optional: Show a small notification if it's a specific change
            if (data.action === 'update' && data.type === 'netwatch') {
                // We don't want to be too noisy, but for testing it's good
                console.log(`Device ${data.id} updated on router ${data.routerId}`);
            }
        });

        // Handle backup success events
        eventSource.addEventListener('backup_status', (event) => {
            const data = JSON.parse(event.data);
            console.log('Backup status received:', data);

            if (data.status === 'success') {
                toast.success(`✅ Backup ${data.type === 'email' ? 'Email' : ''} Sukses: ${data.routerName}`, {
                    duration: 6000,
                    position: 'top-right',
                });
            } else {
                toast.error(`❌ Backup Gagal: ${data.routerName}`, {
                    duration: 8000,
                    position: 'top-right',
                });
            }
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
