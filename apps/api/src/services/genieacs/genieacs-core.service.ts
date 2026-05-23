import axios from 'axios';
import { logger } from '../../lib/logger.js';
import { settingsService } from '../settings.service.js';
import { routerService } from '../router.service.js';
import { decrypt } from '../../lib/encryption.js';
import { settingRepository } from '../../repositories/setting.repository.js';

export interface GenieACSDevice {
    _id: string;
    _registered: string;
    _lastInform: string;
    _ip: string;
    _mac?: string;
    _productClass: string;
    _serialNumber: string;
    _ssid?: string;
    _manufacturer?: string;
    _deviceId?: {
        _Manufacturer: string;
        _OUI: string;
        _ProductClass: string;
        _SerialNumber: string;
    };
    _softwareVersion?: string;
    _rxPower?: string;
    _macAddress?: string;
    _isTr181?: boolean;
    _uptime?: string;
    _temperature?: string;
    _hardwareVersion?: string;
    InternetGatewayDevice?: any;
    Device?: any;
    _tags?: string[];
    _clientCount?: number;
    _pppoeIp?: string;
    _mgmtIp?: string;
    _pppoeUser?: string;
    _connectedHosts?: Array<{
        hostname?: string;
        ipAddress?: string;
        macAddress?: string;
        active?: boolean;
        interfaceType?: string;
        leaseTime?: string;
    }>;
}

export interface WanConfigPayload {
    wanType: 'pppoe' | 'ip';
    connectionMode?: 'route' | 'bridge';
    username?: string;
    password?: string;
    ipAddress?: string;
    subnetMask?: string;
    defaultGateway?: string;
    dnsServers?: string;
    vlanId?: number;
    enable?: boolean;
    connectionIndex?: number;
    addressingType?: 'Static' | 'DHCP';
    bindPorts?: string; // e.g. "LAN1,LAN2,SSID1"
    dhcpServerEnable?: boolean;
    connectionPath?: string; // Opt-in for direct edit
    remoteAccessEnable?: boolean;
    serviceList?: string; // e.g. "INTERNET" or "OTHER"
}

export interface WifiConfigPayload {
    ssidIndex: number; // 1-4
    enable?: boolean;
    ssid?: string;
    password?: string;
    securityMode?: 'Open' | 'WPA-PSK' | 'WPA2-PSK' | 'WPA-WPA2-Mixed' | '11i' | 'WPAand11i' | 'None';
    encryption?: 'AES' | 'TKIP+AES';
    hidden?: boolean;
    channel?: number | 'Auto';
}

/**
 * Helper to fetch GenieACS configuration for a router or tenant
 */
export async function getGenieAcsConfig(routerId?: string, tenantId?: string) {
    let url = '';
    let username = '';
    let password = '';
    let isDedicated = false;

    const effectiveRouterId = (routerId && routerId.trim() !== '') ? routerId : undefined;

    if (effectiveRouterId) {
        const router = await routerService.findById(effectiveRouterId, tenantId as string);
        if (router && router.useGenieAcs) {
            url = router.genieacsUrl || '';
            username = router.genieacsUsername || '';
            password = router.genieacsPasswordEncrypted ? decrypt(router.genieacsPasswordEncrypted) : '';
            if (url) isDedicated = true;
        }
    }

    if (!url) {
        const globalEnabled = await settingsService.getSettingValue<boolean>('genieacs_global_enabled', tenantId as string, true);
        if (!globalEnabled) {
            logger.debug({ tenantId }, 'GenieACS: Global fallback is explicitly DISABLED.');
            return null;
        }

        let effectiveTenantId = tenantId;
        if (!effectiveTenantId) {
            const firstWithAcs = await settingRepository.findFirstByKey('genieacs_url');
            effectiveTenantId = firstWithAcs?.tenantId as string;
        }

        if (effectiveTenantId) {
            const urlSetting = await settingsService.getSetting('genieacs_url', effectiveTenantId);
            const userSetting = await settingsService.getSetting('genieacs_username', effectiveTenantId);
            const passSetting = await settingsService.getSetting('genieacs_password_encrypted', effectiveTenantId);

            url = urlSetting?.value as string || process.env.GENIEACS_URL || '';
            username = userSetting?.value as string || '';
            password = passSetting?.value ? decrypt(passSetting.value as string) : '';
        } else {
            const urlSetting = await settingsService.getSetting('genieacs_url', undefined as any);
            url = urlSetting?.value as string || process.env.GENIEACS_URL || '';
        }
        isDedicated = false;
    }

    if (!url) return null;

    return {
        url: url.replace(/\/$/, ''),
        auth: username && password ? { username, password } : undefined,
        isDedicated
    };
}

/**
 * Test connection to GenieACS
 */
export async function testConnection(routerId?: string) {
    try {
        const config = await getGenieAcsConfig(routerId);
        if (!config) throw new Error('GenieACS: No configuration found');
        const { url, auth } = config;

        const response = await axios.get(`${url}/devices`, {
            params: {
                projection: '_id',
                limit: 1
            },
            auth,
            timeout: 5000
        });

        return {
            success: true,
            url,
            status: response.status
        };
    } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        logger.error({ err: errMsg, routerId }, 'GenieACS: Connection test failed');
        return {
            success: false,
            error: errMsg,
            details: axios.isAxiosError(error) ? error.response?.data : undefined
        };
    }
}
