import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { vpnServerService } from '../services/vpn-server.service';
import toast from 'react-hot-toast';

/**
 * TanStack hooks untuk VPN server management.
 * Polling 10s untuk status (sesuai keputusan UI design).
 */

const KEY = 'vpn-servers';

export function useVpnServers() {
    return useQuery({
        queryKey: [KEY],
        queryFn: vpnServerService.getAll,
        // Refresh tiap 10 detik untuk status badge realtime
        refetchInterval: 10_000,
    });
}

export function useVpnServerSummary() {
    return useQuery({
        queryKey: [KEY, 'summary'],
        queryFn: vpnServerService.getSummary,
        refetchInterval: 10_000,
    });
}

export function useVpnServer(id) {
    return useQuery({
        queryKey: [KEY, id],
        queryFn: () => vpnServerService.getById(id),
        enabled: !!id,
    });
}

export function useVpnServerStatus(id) {
    return useQuery({
        queryKey: [KEY, id, 'status'],
        queryFn: () => vpnServerService.getStatus(id),
        enabled: !!id,
        refetchInterval: 10_000,
    });
}

export function useVpnServerClients(id) {
    return useQuery({
        queryKey: [KEY, id, 'clients'],
        queryFn: () => vpnServerService.getClients(id),
        enabled: !!id,
    });
}

export function useCreateVpnServer() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: vpnServerService.create,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: [KEY] });
            toast.success('VPN server berhasil dibuat');
        },
        onError: (error) => {
            toast.error(error?.message || 'Gagal membuat VPN server');
        },
    });
}

export function useUpdateVpnServer() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ id, data }) => vpnServerService.update(id, data),
        onSuccess: (_data, variables) => {
            queryClient.invalidateQueries({ queryKey: [KEY] });
            queryClient.invalidateQueries({ queryKey: [KEY, variables.id] });
            toast.success('VPN server berhasil diperbarui');
        },
        onError: (error) => {
            toast.error(error?.message || 'Gagal memperbarui VPN server');
        },
    });
}

export function useDeleteVpnServer() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: vpnServerService.delete,
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: [KEY] });
            toast.success('VPN server dihapus');
        },
        onError: (error) => {
            // Spesial-case 409 — error message-nya sudah jelas dari backend,
            // tampil di toast. UI delete dialog tampilkan daftar linkedRouters
            // dari error.details.
            toast.error(error?.message || 'Gagal menghapus VPN server');
        },
    });
}

export function useConnectVpnServer() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: vpnServerService.connect,
        onSuccess: (_data, id) => {
            queryClient.invalidateQueries({ queryKey: [KEY] });
            queryClient.invalidateQueries({ queryKey: [KEY, id] });
            toast.success('Connect request dikirim');
        },
        onError: (error) => {
            toast.error(error?.message || 'Gagal connect');
        },
    });
}

export function useDisconnectVpnServer() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: vpnServerService.disconnect,
        onSuccess: (_data, id) => {
            queryClient.invalidateQueries({ queryKey: [KEY] });
            queryClient.invalidateQueries({ queryKey: [KEY, id] });
            toast.success('Disconnect request dikirim');
        },
        onError: (error) => {
            toast.error(error?.message || 'Gagal disconnect');
        },
    });
}

export function useReconnectVpnServer() {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: vpnServerService.reconnect,
        onSuccess: (_data, id) => {
            queryClient.invalidateQueries({ queryKey: [KEY] });
            queryClient.invalidateQueries({ queryKey: [KEY, id] });
            toast.success('Reconnect request dikirim');
        },
        onError: (error) => {
            toast.error(error?.message || 'Gagal reconnect');
        },
    });
}
