
export interface OnuInfo {
    ponId: string;
    onuId: string;
    sn: string;
    status: string; // 'online' | 'offline' | 'loss_signal' etc.
    signal?: string; // e.g. -20.5 dBm
    distance?: number; // meters
    name?: string;
    description?: string;
}

export interface OltDriverConfig {
    host: string;
    port: number; // 22 (SSH) or 23 (Telnet)
    username?: string;
    password?: string;
    timeout?: number;
}

export interface IOltDriver {
    connect(): Promise<void>;
    disconnect(): Promise<void>;

    /**
     * Get list of all ONUs connected to the OLT
     */
    getOnuList(): Promise<OnuInfo[]>;

    /**
     * Get details for a specific ONU
     */
    getOnuDetails(ponId: string, onuId: string): Promise<OnuInfo | null>;

    /**
     * Reboot a specific ONU
     */
    rebootOnu(ponId: string, onuId: string): Promise<boolean>;
}

export abstract class BaseOltDriver implements IOltDriver {
    protected config: OltDriverConfig;
    protected connected: boolean = false;

    constructor(config: OltDriverConfig) {
        this.config = {
            timeout: 10000,
            ...config
        };
    }

    abstract connect(): Promise<void>;
    abstract disconnect(): Promise<void>;
    abstract getOnuList(): Promise<OnuInfo[]>;
    abstract getOnuDetails(ponId: string, onuId: string): Promise<OnuInfo | null>;
    abstract rebootOnu(ponId: string, onuId: string): Promise<boolean>;
}
