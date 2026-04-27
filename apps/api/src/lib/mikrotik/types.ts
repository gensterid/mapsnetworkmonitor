export interface RouterConnection {
    host: string;
    port: number;
    username: string;
    password: string;
    timeout?: number;
    romon?: string; // MAC address for RoMON connection
}

export interface RouterNeighbor {
    id: string; 
    identity?: string;
    address?: string;
    macAddress?: string;
    model?: string;
    version?: string;
    interface?: string;
    uptime?: string;
}

export interface RomonNeighbor {
    romonId?: string; // MAC address
    path?: string;
    mtu?: number;
    identity?: string;
    board?: string;
    version?: string;
}

export interface RouterInfo {
    identity?: string;
    version?: string;
    model?: string;
    serialNumber?: string;
    boardName?: string;
    architecture?: string;
}

export interface RouterResources {
    uptime?: string;
    cpuLoad?: number;
    cpuCount?: number;
    cpuFrequency?: number;
    totalMemory?: number;
    usedMemory?: number;
    freeMemory?: number;
    totalDisk?: number;
    usedDisk?: number;
    freeDisk?: number;
    boardTemp?: number;
    voltage?: number;
}

export interface RouterInterfaceData {
    name: string;
    defaultName?: string;
    type?: string;
    macAddress?: string;
    running?: boolean;
    disabled?: boolean;
    txBytes?: number;
    rxBytes?: number;
    txPackets?: number;
    rxPackets?: number;
    txDrops?: number;
    rxDrops?: number;
    txErrors?: number;
    rxErrors?: number;
    speed?: string;
    comment?: string;
    txRate: number;
    rxRate: number;
}

export interface NetwatchData {
    host: string;
    name?: string;
    comment?: string;
    status?: string;
    timeout?: number;
    interval?: number;
    sinceUp?: Date;
    sinceDown?: Date;
    disabled?: boolean;
    upScript?: string;
    downScript?: string;
    _id?: string;
}

export interface PppSession {
    name: string;
    service?: string;
    callerId?: string;
    address?: string;
    uptime?: string;
    uptimeSeconds?: number;
    encoding?: string;
    sessionId?: string;
    limitBytesIn?: number;
    limitBytesOut?: number;
    bytesIn?: number;
    bytesOut?: number;
}

export interface SimpleQueueData {
    name: string;
    target: string;
    rate?: string; 
    maxLimit?: string; 
    bytes: string; 
    packets: string; 
    dynamic: boolean;
    disabled: boolean;
    comment?: string;
}
