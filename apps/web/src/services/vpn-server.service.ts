import { get, post, patch, del } from '@/lib/api';

/**
 * VPN Server management service — SuperAdmin only.
 * Wraps /api/superadmin/vpn-servers/* endpoints (Phase 3.2 backend).
 */

const BASE = '/superadmin/vpn-servers';

export interface VpnServer {
    id: string;
    name: string;
    region: string | null;
    type: 'openvpn';
    enabled: boolean;
    priority: number;
    notes: string | null;
    host: string;
    port: number;
    proto: 'tcp' | 'udp';
    username: string;
    hasPassword: boolean;
    mode: 'tap' | 'tun';
    cipher: string;
    auth: string;
    caCertPem: string | null;
    verifyServerCert: boolean;
    extraConfig: string | null;
    clientSubnet: string;
    status: 'connected' | 'connecting' | 'disconnected' | 'error' | 'disabled';
    tunnelIp: string | null;
    lastConnectedAt: string | null;
    lastDisconnectedAt: string | null;
    lastError: string | null;
    lastCheckedAt: string | null;
    connectionAttempts: number;
    createdBy: string | null;
    updatedBy: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface VpnServerSummary {
    total: number;
    connected: number;
    disconnected: number;
    error: number;
    disabled: number;
    totalClients: number;
}

export interface VpnServerClient {
    id: string;
    name: string;
    host: string;
    status: string | null;
}

export interface VpnServerStatus {
    id: string;
    status: string;
    tunnelIp: string | null;
    lastConnectedAt: string | null;
    lastDisconnectedAt: string | null;
    lastError: string | null;
    lastCheckedAt: string | null;
    connectionAttempts: number;
}

export interface CreateVpnServerInput {
    name: string;
    region?: string | null;
    type: 'openvpn';
    enabled?: boolean;
    priority?: number;
    notes?: string | null;
    host: string;
    port: number;
    proto?: 'tcp' | 'udp';
    username: string;
    password: string;
    mode?: 'tap' | 'tun';
    cipher?: string;
    auth?: string;
    caCertPem?: string | null;
    verifyServerCert?: boolean;
    extraConfig?: string | null;
    clientSubnet: string;
}

export type UpdateVpnServerInput = Partial<Omit<CreateVpnServerInput, 'password'>> & {
    password?: string | null;
};

export const vpnServerService = {
    getAll: () => get<VpnServer[]>(BASE),

    getSummary: () => get<VpnServerSummary>(`${BASE}/summary`),

    getById: (id: string) => get<VpnServer>(`${BASE}/${id}`),

    getStatus: (id: string) => get<VpnServerStatus>(`${BASE}/${id}/status`),

    getClients: (id: string) => get<VpnServerClient[]>(`${BASE}/${id}/clients`),

    create: (data: CreateVpnServerInput) => post<VpnServer>(BASE, data),

    update: (id: string, data: UpdateVpnServerInput) =>
        patch<VpnServer>(`${BASE}/${id}`, data),

    delete: (id: string) => del(`${BASE}/${id}`),

    connect: (id: string) => post<{ status: string }>(`${BASE}/${id}/connect`),

    disconnect: (id: string) => post<{ status: string }>(`${BASE}/${id}/disconnect`),

    reconnect: (id: string) => post<{ status: string }>(`${BASE}/${id}/reconnect`),
};
