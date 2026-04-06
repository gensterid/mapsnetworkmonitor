import { useState, useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';

// Module-level variables to hold queued alerts and the timer for grouping
let alertQueue = [];
let alertTimer = null;

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

        // Handle and sync all types of alert updates (acknowledge, resolve, bulk actions)
        eventSource.addEventListener('alerts_updated', (event) => {
            const data = JSON.parse(event.data);
            console.log('Alerts updated (sync event):', data);
            
            // Shared invalidation for any alert state change
            // This will refetch both the alert list and the unread counts
            queryClient.invalidateQueries({ queryKey: ['alerts'] });
        });

        // Handle new alert events with grouping
        eventSource.addEventListener('new_alert', (event) => {
            const data = JSON.parse(event.data);
            console.log('New alert received:', data);
            setLastEvent(data);

            // Add the new alert to our queue
            alertQueue.push(data.alert || { title: 'New Alert' });

            // Clear any existing timer
            if (alertTimer) clearTimeout(alertTimer);

            // Set a new timer to process the queue after 1 second
            alertTimer = setTimeout(() => {
                if (alertQueue.length === 1) {
                    // Single alert, show it normally
                    toast.error(`🚨 ${alertQueue[0].title || 'New Alert'}`, {
                        duration: 5000,
                        position: 'top-right',
                    });
                } else if (alertQueue.length > 1) {
                    // Extract unique router names
                    const routerNames = [...new Set(alertQueue.map(a => a.routerName).filter(Boolean))];
                    const routerStr = routerNames.length > 0 ? ` (Router: ${routerNames.join(', ')})` : '';
                    
                    // Multiple alerts, show a grouped summary
                    toast.error(`🚨 Peringatan: ${alertQueue.length} perangkat/sistem${routerStr} mengalami gangguan hampir bersamaan!`, {
                        duration: 8000,
                        position: 'top-right',
                    });
                }
                
                // Clear the queue for the next batch
                alertQueue = [];
            }, 1000); // 1-second grouping window

            // Invalidate alert queries to refresh both list and badge
            queryClient.invalidateQueries({ queryKey: ['alerts'] });
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
