/**
 * API Types
 * Type definitions for API responses and requests
 */

// Router types
export interface Router {
    id: string;
    name: string;
    host: string;
    port: number;
    username: string;
    status: 'online' | 'offline' | 'maintenance' | 'unknown';
    latitude?: string;
    longitude?: string;
    location?: string;
    locationImage?: string;
    groupId?: string;
    notificationGroupId?: string;
    notes?: string;
    routerOsVersion?: string;
    model?: string;
    serialNumber?: string;
    identity?: string;
    boardName?: string;
    architecture?: string;
    lastSeen?: string;
    latency?: number;
    createdAt: string;
    updatedAt: string;
    latestMetrics?: RouterMetric;
    maxInterfaceSpeed?: string;
}

export interface CreateRouterInput {
    name: string;
    host: string;
    port?: number;
    username: string;
    password: string;
    latitude?: string;
    longitude?: string;
    location?: string;
    locationImage?: string;
    groupId?: string;
    notificationGroupId?: string;
    notes?: string;
}

export interface UpdateRouterInput {
    name?: string;
    host?: string;
    port?: number;
    username?: string;
    password?: string;
    latitude?: string;
    longitude?: string;
    location?: string;
    locationImage?: string;
    groupId?: string;
    notificationGroupId?: string;
    notes?: string;
    status?: 'online' | 'offline' | 'maintenance' | 'unknown';
}

// Router Interface types
export interface RouterInterface {
    id: string;
    routerId: string;
    name: string;
    type?: string;
    macAddress?: string;
    mtu?: number;
    running?: boolean;
    disabled?: boolean;
    speed?: string;
    txBytes?: number;
    rxBytes?: number;
    txRate?: number;
    rxRate?: number;
    status?: string;
    lastUpdated?: string;
}

// Router Metric types
export interface RouterMetric {
    id: string;
    routerId: string;
    cpuLoad?: number;
    cpuCount?: number;
    cpuFrequency?: number;
    totalMemory?: number;
    usedMemory?: number;
    freeMemory?: number;
    totalDisk?: number;
    usedDisk?: number;
    freeDisk?: number;
    uptime?: number;
    boardTemp?: number;
    voltage?: number;
    recordedAt: string;
}

// Netwatch types
export interface Netwatch {
    id: string;
    routerId: string;
    host: string;
    name?: string;
    deviceType?: 'client' | 'olt' | 'odp';
    interval?: number;
    status: 'up' | 'down' | 'unknown';
    lastUp?: string;
    lastDown?: string;
    latitude?: string;
    longitude?: string;
    location?: string;
    waypoints?: string;
    connectionType?: 'router' | 'client';
    connectedToId?: string;
    createdAt: string;
    updatedAt: string;
}

export interface CreateNetwatchInput {
    host: string;
    name?: string;
    deviceType?: 'client' | 'olt' | 'odp';
    interval?: number;
    latitude?: string;
    longitude?: string;
    location?: string;
    waypoints?: string;
    connectionType?: 'router' | 'client';
    connectedToId?: string;
}

export interface UpdateNetwatchInput {
    host?: string;
    name?: string;
    deviceType?: 'client' | 'olt' | 'odp';
    interval?: number;
    latitude?: string;
    longitude?: string;
    location?: string;
    waypoints?: string;
    connectionType?: 'router' | 'client';
    connectedToId?: string;
    status?: 'up' | 'down' | 'unknown';
}

// Test connection types
export interface TestConnectionInput {
    host: string;
    port: number;
    username: string;
    password: string;
}

export interface TestConnectionResult {
    success: boolean;
    info?: unknown;
    error?: string;
}

// Group types
export interface Group {
    id: string;
    name: string;
    description?: string;
    color?: string;
    createdAt: string;
    updatedAt: string;
}

export interface CreateGroupInput {
    name: string;
    description?: string;
    color?: string;
}

export interface UpdateGroupInput {
    name?: string;
    description?: string;
    color?: string;
}

// Settings types
export interface Setting {
    key: string;
    value: string;
    description?: string;
    createdAt: string;
    updatedAt: string;
}

export interface SettingsMap {
    [key: string]: string;
}

// Audit Log types
export interface AuditLog {
    id: string;
    userId?: string;
    action: string;
    resource: string;
    resourceId?: string;
    details?: string;
    ipAddress?: string;
    userAgent?: string;
    createdAt: string;
}
