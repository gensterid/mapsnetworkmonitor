import axios from 'axios';
import { logger } from '../lib/logger.js';
import { settingsService } from './settings.service.js';
import { routerService } from './router.service.js';
import { cacheService } from '../lib/cache.js';
import { encrypt, decrypt } from '../lib/encryption.js';
import { db } from '../db/index.js';
import { onus, olts, devicePerformanceHistory, routerNetwatch, appSettings, genieacsBackups } from '../db/schema/index.js';
import { oltService } from './olt.service.js';
import { eq, inArray, and, or, desc, sql } from 'drizzle-orm';

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

// Device Driver Interface for model-specific overrides
export interface GenieACSDeviceDriver {
    name: string;
    description?: string;
    rootPath?: 'InternetGatewayDevice.' | 'Device.';
    onWanUpdate?: (params: any[], config: WanConfigPayload, device: any, addParam: (name: string, value: any, type?: string) => void) => void;
    onWifiUpdate?: (params: any[], config: WifiConfigPayload, device: any, addParam: (name: string, value: any, type?: string) => void) => void;
    onGlobalUpdate?: (params: any[], config: WanConfigPayload, device: any, addParam: (name: string, value: any, type?: string) => void) => void;
    onWanDelete?: (deviceId: string, connectionPath: string) => string;
    getNewWcdIndex?: (device: any) => number;
}

// End of imports

async function getGenieAcsConfig(routerId?: string, tenantId?: string) {
    let url = '';
    let username = '';
    let password = '';
    let isDedicated = false;

    // 1. MASTER FEATURE TOGGLE (Kill Switch for everything ACS)
    // Normalize routerId: empty string should be treated as undefined
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
        // Fallback Logic: Check if Global Fallback is allowed
        const globalEnabled = await settingsService.getSettingValue<boolean>('genieacs_global_enabled', tenantId as string, true);
        if (!globalEnabled) {
            logger.debug({ tenantId }, 'GenieACS: Global fallback is explicitly DISABLED.');
            return null;
        }

        // Try to find the first tenant that has GenieACS configured if tenantId is missing
        let effectiveTenantId = tenantId;
        if (!effectiveTenantId) {
            const [firstWithAcs] = await db.select({ tenantId: appSettings.tenantId })
                .from(appSettings)
                .where(eq(appSettings.key as any, 'genieacs_url'))
                .limit(1);
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
            // Absolute last resort: ENV or global fallbacks via settingsService with undefined
            const urlSetting = await settingsService.getSetting('genieacs_url', undefined as any);
            url = urlSetting?.value as string || process.env.GENIEACS_URL || '';
        }
        isDedicated = false;
    }

    if (!url) {
        return null;
    }

    return {
        url: url.replace(/\/$/, ''),
        auth: username && password ? { username, password } : undefined,
        isDedicated
    };
}

const DEVICE_DRIVERS: Record<string, GenieACSDeviceDriver> = {
    'FIBERHOME:HG6243C': {
        name: 'FiberHome HG6243C',
        description: 'Specific driver for HG6243C model (TR-098)',
        onWanUpdate: (params, config, device, addParam) => {
            const isBridge = config.connectionMode === 'bridge';
            
            // VLAN & Mode settings
            if (config.vlanId !== undefined) {
                // FiberHome HG6243C bridge mode specific requirement: VLANEnable false
                addParam('VLANEnable', false, 'xsd:boolean');
                addParam('VLANID', config.vlanId, 'xsd:unsignedInt');
                const mode = isBridge ? 2 : 1;
                addParam('X_CT-COM_Mode', mode, 'xsd:unsignedInt');
                // Ensure vendor specific VLAN is also set
                addParam('X_CT-COM_VLANID', config.vlanId, 'xsd:unsignedInt');
            }
            
            // NAT settings: HG6243C bridge mode requirement: NATEnabled true
            if (isBridge) {
                addParam('NATEnabled', true, 'xsd:boolean');
            }

            // Port Binding: FiberHome expects full TR-069 paths
            if (config.bindPorts) {
                const ports = config.bindPorts.split(',').map((s: string) => s.trim());
                const fullPaths = ports.map((p: string) => {
                    const upper = p.toUpperCase();
                    if (upper.startsWith('LAN')) {
                        const num = upper.replace('LAN', '');
                        return `InternetGatewayDevice.LANDevice.1.LANEthernetInterfaceConfig.${num}`;
                    } else if (upper.startsWith('SSID')) {
                        const num = upper.replace('SSID', '');
                        return `InternetGatewayDevice.LANDevice.1.WLANConfiguration.${num}`;
                    }
                    return p;
                });
                addParam('X_CT-COM_BindPort', fullPaths.join(','));
                addParam('X_FH_LanInterface', fullPaths.join(','));
            }

            // Service List & Naming
            addParam('X_FH_ServiceList', config.serviceList || 'INTERNET');
            addParam('X_CT-COM_ServiceList', config.serviceList || 'INTERNET');
            const connModeShort = isBridge ? 'B' : 'R';
            addParam('Name', `2_INTERNET_${connModeShort}_VID_${config.vlanId || ''}`);
        },
        onGlobalUpdate: (params, config, device, addParam) => {
            if (config.remoteAccessEnable !== undefined) {
                addParam('InternetGatewayDevice.X_FH_FireWall.REMOTEACCEnable', config.remoteAccessEnable, 'xsd:boolean');
            }
        },
        onWanDelete: (id, path) => {
            const match = path.match(/(.*WANConnectionDevice\.\d+)/);
            return match ? match[1] : path;
        },
        getNewWcdIndex: (device) => {
            const root = device.InternetGatewayDevice || device.Device;
            const wcds = root?.WANDevice?.['1']?.WANConnectionDevice || {};
            const indices = Object.keys(wcds).map(k => parseInt(k)).filter(n => !isNaN(n));
            const maxIdx = indices.length > 0 ? Math.max(...indices) : 1;
            return maxIdx + 1;
        }
    },
    'FIBERHOME:GENERIC': {
        name: 'FiberHome Generic',
        description: 'Generic fallback for FiberHome devices (Dynamic TR detection)',
        onWanUpdate: (params, config, device, addParam) => {
            const isBridge = config.connectionMode === 'bridge';
            const rootPath = !!device.Device ? 'Device.' : 'InternetGatewayDevice.';

            if (config.vlanId !== undefined) {
                addParam('VLANEnable', true, 'xsd:boolean');
                addParam('VLANID', config.vlanId, 'xsd:unsignedInt');
                const mode = isBridge ? 2 : 1;
                addParam('X_CT-COM_Mode', mode, 'xsd:unsignedInt');
                addParam('X_CT-COM_VLANID', config.vlanId, 'xsd:unsignedInt');
                // FiberHome specific
                addParam('X_FH_VLANEnable', 1, 'xsd:unsignedInt');
                addParam('X_FH_VLANID', config.vlanId, 'xsd:unsignedInt');
                // NAT Management for FiberHome
                addParam('NATEnabled', !isBridge, 'xsd:boolean');
                addParam('X_FH_NATEnabled', !isBridge, 'xsd:boolean');
                (config as any)._skipNat = true; // Tell common logic we handled NAT
            }

            // Port Binding
            if (config.bindPorts) {
                const ports = config.bindPorts.split(',').map((s: string) => s.trim());
                const fullPaths = ports.map((p: string) => {
                    const upper = p.toUpperCase();
                    if (upper.startsWith('LAN')) {
                        const num = upper.replace('LAN', '');
                        return `${rootPath}LANDevice.1.LANEthernetInterfaceConfig.${num}`;
                    } else if (upper.startsWith('SSID')) {
                        const num = upper.replace('SSID', '');
                        return `${rootPath}LANDevice.1.WLANConfiguration.${num}`;
                    }
                    return p;
                });
                addParam('X_CT-COM_BindPort', fullPaths.join(','));
                addParam('X_FH_LanInterface', fullPaths.join(','));
            }

            // Service List & Naming
            addParam('X_FH_ServiceList', config.serviceList || 'INTERNET');
            addParam('X_CT-COM_ServiceList', config.serviceList || 'INTERNET');
            const connModeShort = isBridge ? 'B' : 'R';
            addParam('Name', `2_INTERNET_${connModeShort}_VID_${config.vlanId || ''}`);
        },
        onGlobalUpdate: (params, config, device, addParam) => {
            if (config.remoteAccessEnable !== undefined) {
                const rootPath = !!device.Device ? 'Device.' : 'InternetGatewayDevice.';
                addParam(`${rootPath}X_FH_FireWall.REMOTEACCEnable`, config.remoteAccessEnable, 'xsd:boolean');
            }
        },
        onWanDelete: (id, path) => {
            const match = path.match(/(.*WANConnectionDevice\.\d+)/);
            return match ? match[1] : path;
        },
        getNewWcdIndex: (device) => {
            const root = device.InternetGatewayDevice || device.Device;
            const wcds = root?.WANDevice?.['1']?.WANConnectionDevice || {};
            const indices = Object.keys(wcds).map(k => parseInt(k)).filter(n => !isNaN(n));
            const maxIdx = indices.length > 0 ? Math.max(...indices) : 1;
            return maxIdx + 1;
        }
    },
    'ZTE:GENERIC': {
        name: 'ZTE Generic',
        description: 'Generic driver for ZTE devices',
        onWanUpdate: (params, config, device, addParam) => {
            const isBridge = config.connectionMode === 'bridge';
            const isPppoe = config.wanType === 'pppoe';
            
            // 1. VLAN & Mode settings (Match user's "Success" table exactly)
            if (config.vlanId !== undefined) {
                // ZTE F609 specific VLAN enable (1 = enabled)
                addParam('X_ZTE-COM_VLANEnable', 1, 'xsd:unsignedInt');
                addParam('X_ZTE-COM_VLANID', config.vlanId, 'xsd:unsignedInt');
            }

            // 2. Port Binding: ZTE F609 uses X_ZTE-COM_LanInterface instead of X_ZTE-COM_BindPort
            if (config.bindPorts) {
                const rootPath = !!device.Device ? 'Device.' : 'InternetGatewayDevice.';
                const ports = config.bindPorts.split(',').map((s: string) => s.trim());
                const fullPaths = ports.map((p: string) => {
                    const upper = p.toUpperCase();
                    if (upper.startsWith('LAN')) {
                        const num = upper.replace('LAN', '');
                        return `${rootPath}LANDevice.1.LANEthernetInterfaceConfig.${num}`;
                    } else if (upper.startsWith('SSID')) {
                        const num = upper.replace('SSID', '');
                        return `${rootPath}LANDevice.1.WLANConfiguration.${num}`;
                    }
                    return p;
                });
                addParam('X_ZTE-COM_LanInterface', fullPaths.join(','));
            }
            
            // 3. Name: Match success example exactly
            if (!config.connectionPath) {
                addParam('Name', isBridge ? 'BRIDGE' : (isPppoe ? (config.username || 'internet') : 'internet'));
            }
            
            addParam('X_ZTE-COM_ServiceList', config.serviceList || 'INTERNET');

            // 4. ConnectionType & NAT: Match example exactly
            if (isPppoe) {
                addParam('ConnectionType', isBridge ? 'PPPoE_Bridged' : 'PPPoE_Routed');
            } else {
                addParam('ConnectionType', isBridge ? 'IP_Bridged' : 'IP_Routed');
            }

            // NAT: Explicitly false for Bridge
            addParam('NATEnabled', !isBridge, 'xsd:boolean');
            (config as any)._skipNat = true;

            // 5. Enable: Match example
            if (config.enable !== undefined) {
                addParam('Enable', config.enable, 'xsd:boolean');
            }
        },
        onWifiUpdate: (params, config, device, addParam) => {
            if (!device.Device) { // TR-098 (ZTE F609)
                if (config.enable !== undefined) {
                    addParam('RadioEnabled', config.enable, 'xsd:boolean');
                }
                
                if (config.securityMode === 'WPA2-PSK' || config.securityMode === '11i' || config.securityMode === 'WPAand11i') {
                    addParam('BeaconType', '11i');
                    addParam('IEEE11iAuthenticationMode', 'PSKAuthentication', 'xsd:string');
                    addParam('IEEE11iEncryptionModes', config.encryption === 'TKIP+AES' ? 'TKIPandAESEncryption' : 'AESEncryption');
                } else if (config.securityMode === 'Open' || config.securityMode === 'None') {
                    addParam('BeaconType', 'None');
                }
            }
        },
        getNewWcdIndex: (device) => {
            // ZTE F609 often only allows one WANConnectionDevice (Indeks 1)
            // We should use instance 1 and create multiple sub-interfaces inside it.
            return 1;
        }
    },
    'HUAWEI:GENERIC': {
        name: 'Huawei Generic',
        description: 'Generic driver for Huawei devices',
        onWanUpdate: (params, config, device, addParam) => {
            const isBridge = config.connectionMode === 'bridge';
            if (config.vlanId !== undefined) {
                addParam('X_HW_VLAN', config.vlanId, 'xsd:unsignedInt');
                addParam('VLANID', config.vlanId, 'xsd:unsignedInt');
            }
            if (config.bindPorts) {
                const rootPath = !!device.Device ? 'Device.' : 'InternetGatewayDevice.';
                const ports = config.bindPorts.split(',').map((s: string) => s.trim());
                const fullPaths = ports.map((p: string) => {
                    const upper = p.toUpperCase();
                    if (upper.startsWith('LAN')) {
                        const num = upper.replace('LAN', '');
                        return `${rootPath}LANDevice.1.LANEthernetInterfaceConfig.${num}`;
                    } else if (upper.startsWith('SSID')) {
                        const num = upper.replace('SSID', '');
                        return `${rootPath}LANDevice.1.WLANConfiguration.${num}`;
                    }
                    return p;
                });
                addParam('X_HW_LANBinding', fullPaths.join(','));
            }
            addParam('X_HW_ServiceList', config.serviceList || 'INTERNET');
            addParam('ServiceList', config.serviceList || 'INTERNET');
            
            const connModeShort = isBridge ? 'B' : 'R';
            addParam('Name', `WAN_INTERNET_${connModeShort}_VID_${config.vlanId || ''}`);
            
            addParam('NATEnabled', !isBridge, 'xsd:boolean');
            (config as any)._skipNat = true;
        }
    }
};

function findDriver(device: GenieACSDevice): GenieACSDeviceDriver | null {
    const manufacturer = (device._deviceId?._Manufacturer || '').toUpperCase();
    const productClass = (device._productClass || '').toUpperCase();
    
    // 1. Try Specific Model Match
    const modelKey = `${manufacturer}:${productClass}`;
    if (DEVICE_DRIVERS[modelKey]) return DEVICE_DRIVERS[modelKey];
    
    // 2. Try Generic Manufacturer Match
    if (manufacturer.includes('FIBERHOME') || manufacturer.includes('FH') || manufacturer.includes('FHTT')) {
        return DEVICE_DRIVERS['FIBERHOME:GENERIC'];
    }
    if (manufacturer.includes('ZTE')) return DEVICE_DRIVERS['ZTE:GENERIC'];
    if (manufacturer.includes('HUAWEI')) return DEVICE_DRIVERS['HUAWEI:GENERIC'];
    
    // 3. Last fallback
    if (productClass.includes('HG6') || productClass.includes('AN5')) return DEVICE_DRIVERS['FIBERHOME:GENERIC'];
    
    return null;
}

export const genieacsService = {
    /**
     * Get all devices from GenieACS
     * Supports MongoDB-style query
     */
    getDevices: async (routerId?: string, tenantId?: string, query: any = {}, force = false, projectionMode: 'full' | 'stats' = 'full'): Promise<GenieACSDevice[]> => {
        const cacheKey = `genieacs:devices:${tenantId || 'all'}:${routerId || 'all'}:${JSON.stringify(query)}:${projectionMode}`;
        if (!force) {
            const cached = cacheService.get<GenieACSDevice[]>(cacheKey);
            if (cached) return cached;
        }

        try {
            const config = await getGenieAcsConfig(routerId, tenantId);
            if (!config) {
                logger.debug({ routerId, tenantId }, 'GenieACS: No configuration found, skipping fetch.');
                return [];
            }
            const { url, auth, isDedicated } = config;

            // Debug: Log URL to verify Proxmox connectivity
            logger.info({ url, routerId, isDedicated }, 'GenieACS: Fetching devices');

            // Apply Router Filter: Only show devices that exist in our inventory for this router
            // IMPORTANT: If ACS is dedicated to this router, show ALL devices in that ACS.
            // If it's a shared/global ACS (!isDedicated), we MUST filter by SN.
            if (routerId && !isDedicated) {
                const routerOnus = await db
                    .select({ sn: onus.sn })
                    .from(onus)
                    .innerJoin(olts, eq(onus.oltId, olts.id))
                    .where(eq(olts.parentId, routerId));

                const snFilter = routerOnus.map((o: any) => o.sn).filter(Boolean);

                if (snFilter.length > 0) {
                    // Merge with existing query if any
                    query['_deviceId._SerialNumber'] = { '$in': snFilter };
                } else {
                    // If no ONUs registered for this router on shared ACS, return empty
                    return [];
                }
            }

            const projection: Record<string, any> = {
                _id: 1,
                _registered: 1,
                _lastInform: 1,
                '_deviceId._SerialNumber': 1,
                '_deviceId._ProductClass': 1,
                '_deviceId._OUI': 1,
                '_deviceId._Manufacturer': 1,
                '_deviceId._SoftwareVersion': 1,
                _tags: 1,
                _mac: 1,
                // STATUS (Optical Power, Temperature, IP)
                'InternetGatewayDevice.ManagementServer.ConnectionRequestURL': 1,
                'Device.ManagementServer.ConnectionRequestURL': 1,
                'InternetGatewayDevice.WANDevice.1.X_ZTE-COM_WANDevice.1.OpticalModuleInfo.RXPower': 1,
                'InternetGatewayDevice.WANDevice.1.X_ZTE-COM_WANDevice.1.OpticalInstance.1.OpticalSignalLevel': 1,
                'InternetGatewayDevice.WANDevice.1.X_ZTE-COM_WANPONInterfaceConfig.RXPower': 1,
                'InternetGatewayDevice.WANDevice.1.X_ZTE_COM_WANPONInterfaceConfig.RXPower': 1,
                'InternetGatewayDevice.WANDevice.1.One_Optical_Module_Info.RXPower': 1,
                'InternetGatewayDevice.WANDevice.1.X_ZTE-COM_ONU.1.OpticalModuleInfo.RXPower': 1,
                'InternetGatewayDevice.WANDevice.1.X_ZTE_COM_ONU.1.OpticalModuleInfo.RXPower': 1,
                'InternetGatewayDevice.WANDevice.1.X_ZTE-COM_WANDevice.1.X_ZTE-COM_Optical.1.RxPower': 1,
                'InternetGatewayDevice.WANDevice.1.X_ZTE_COM_WANDevice.1.X_ZTE_COM_Optical.1.RxPower': 1,
                'InternetGatewayDevice.WANDevice.1.X_HUWEI_WANDevice.1.OpticalModuleInfo.RXPower': 1,
                'InternetGatewayDevice.WANDevice.1.WANDSLInterfaceConfig.DownstreamAttenuation': 1,
                'InternetGatewayDevice.WANDevice.1.X_FH_GponInterfaceConfig.RXPower': 1,
                'VirtualParameters.RXPower': 1,
                'VirtualParameters.IPTR069': 1,
                // TEMPERATURE
                'InternetGatewayDevice.DeviceInfo.Temperature': 1,
                'Device.DeviceInfo.Temperature': 1,
                'VirtualParameters.Temperature': 1,
                'VirtualParameters.gettemp': 1,
                // MAC ADDRESSES
                'VirtualParameters.PonMac': 1,
                'VirtualParameters.pppoeMac': 1,
                'VirtualParameters.MACAddress': 1,
                // OTHERS & CLIENT COUNT
                'InternetGatewayDevice.DeviceInfo.UpTime': 1,
                'Device.DeviceInfo.UpTime': 1,
                'VirtualParameters.ConnectedDevices': 1,
            };

            // Add heavy paths only in FULL mode
            if (projectionMode === 'full') {
                projection['InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.SSID'] = 1;
                projection['Device.WiFi.SSID.1.SSID'] = 1;
                projection['InternetGatewayDevice.WANDevice.1.WANConnectionDevice'] = 1;
                projection['InternetGatewayDevice.LANDevice.1.LANEthernetInterfaceConfig.1.MACAddress'] = 1;
                projection['InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.MACAddress'] = 1;
                projection['InternetGatewayDevice.WANDevice.1.WANConnectionDevice.2.WANPPPConnection.1.MACAddress'] = 1;
                projection['InternetGatewayDevice.WANDevice.1.WANConnectionDevice.3.WANIPConnection.1.MACAddress'] = 1;
                projection['Device.Ethernet.Interface.1.MACAddress'] = 1;
                projection['InternetGatewayDevice.DeviceInfo.HardwareVersion'] = 1;
                projection['Device.DeviceInfo.HardwareVersion'] = 1;
                projection['InternetGatewayDevice.ManagementServer.ManageableDeviceNumberOfEntries'] = 1;
                projection['InternetGatewayDevice.Hosts.HostNumberOfEntries'] = 1;
                projection['Device.Hosts.HostNumberOfEntries'] = 1;
                projection['InternetGatewayDevice.LANDevice.1.Hosts.HostNumberOfEntries'] = 1;
                projection['InternetGatewayDevice.LANDevice.1.Hosts.Host'] = 1;
                projection['Device.Hosts.Host'] = 1;
                projection['Device.Hosts.Host.1.PhysAddress'] = 1;
                projection['InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.TotalAssociations'] = 1;
            }

            const response = await axios.get(`${url}/devices`, {
                params: {
                    query: JSON.stringify(query),
                    projection: Object.keys(projection).join(',')
                },
                auth,
                timeout: 10000 // Increased timeout for Proxmox
            });

            logger.info({ count: response.data?.length || 0 }, 'GenieACS: Successfully fetched devices');

            const result = response.data.map((dev: any) => transformGenieACSDevice(dev));

            // Cache for 30s
            cacheService.set(cacheKey, result, cacheService.TTL.GENIEACS_DEVICES);

            return result;
        } catch (error) {
            const errMsg = error instanceof Error ? error.message : String(error);
            logger.error({ err: errMsg }, 'GenieACS: Failed to fetch devices');
            return [];
        }
    },

    /**
     * UNIFIED LINKAGE: Sync GenieACS metadata to ONUS table
     */
    syncMetadata: async (routerId?: string, tenantId?: string) => {
        let added = 0;
        let updated = 0;
        let total = 0;

        try {
            // Check Master Toggle and Sync Toggle
            if (tenantId) {
                const masterEnabled = await settingsService.getSettingValue<boolean>('genieacs_enabled', tenantId as string, true);
                const syncEnabled = await settingsService.getSettingValue<boolean>('acs_sync_enabled', tenantId as string, true);
                
                if (!masterEnabled) {
                    logger.debug({ tenantId }, 'GenieACS: Master toggle OFF, skipping metadata sync');
                    return { added, updated, total };
                }
                
                // acs_sync_enabled (Global Polling) ONLY blocks global sync (no routerId)
                if (!routerId && !syncEnabled) {
                    logger.debug({ tenantId }, 'GenieACS: Global polling OFF, skipping global metadata sync');
                    return { added, updated, total };
                }
            }

            logger.info({ tenantId }, 'GenieACS: Starting metadata sync');

            // Invalidate device list cache before fresh sync
            cacheService.invalidatePrefix(`genieacs:devices:${tenantId || 'all'}`);

            const devices = await genieacsService.getDevices(routerId, tenantId);
            total = devices.length;

            for (const dev of devices) {
                if (!dev._serialNumber) continue;

                const sn = dev._serialNumber;

                // Check if exists
                const filters = [eq(onus.sn, sn)];
                if (tenantId) filters.push(eq(onus.tenantId, tenantId));
                const [existing] = await db.select().from(onus).where(and(...filters));

                // AUTO-DISCOVERY: If routerId is not defined (Shared ACS), try to link via IP match in netwatch
                let resolvedRouterId = routerId || existing?.routerId;
                if (!resolvedRouterId && dev._ip) {
                    try {
                        const [matchedNetwatch] = await db.select({ routerId: routerNetwatch.routerId })
                            .from(routerNetwatch)
                            .where(eq(routerNetwatch.host, dev._ip))
                            .limit(1);
                        if (matchedNetwatch) {
                            resolvedRouterId = matchedNetwatch.routerId;
                            logger.info({ sn, ip: dev._ip, routerId: resolvedRouterId }, 'Successfully linked ACS device to router via IP discovery');
                        }
                    } catch (e) {
                        // Ignore lookup errors
                    }
                }

                let targetOnuId = existing?.id;

                if (existing) {
                    // Update
                    const sources = (existing.discoverySources as string[]) || [];
                    if (!sources.includes('acs')) sources.push('acs');

                    const hasOltSource = sources.includes('olt');
                    const shouldKeepOltSignal = hasOltSource && existing.lastRxPower !== null;
                    const newRxPower = shouldKeepOltSignal ? existing.lastRxPower : (dev._rxPower || existing.lastRxPower);

                    await db.update(onus).set({
                        routerId: resolvedRouterId,
                        model: dev._productClass || existing.model,
                        ssid: dev._ssid || existing.ssid,
                        firmwareVersion: dev._softwareVersion || existing.firmwareVersion,
                        host: dev._ip || existing.host,
                        lastRxPower: newRxPower,
                        macAddress: dev._macAddress || existing.macAddress,
                        discoverySources: sources,
                        updatedAt: new Date(),
                        lastSeen: dev._lastInform ? new Date(dev._lastInform) : existing.lastSeen
                    }).where(eq(onus.id, existing.id));

                    // 📈 Log to Performance History for Charts (Sync/Update scenario)
                    if (dev._rxPower && resolvedRouterId) {
                        const parsedSignal = oltService.parseSignal(dev._rxPower);
                        if (parsedSignal !== null) {
                            await db.insert(devicePerformanceHistory).values({
                                tenantId: tenantId || (existing as any).tenantId || '',
                                routerId: resolvedRouterId,
                                onuId: existing.id,
                                signal: parsedSignal,
                                recordedAt: new Date()
                            }).execute().catch((err: any) => logger.error({ err, sn }, 'Failed to record ACS signal history update'));
                        }
                    }
                    updated++;
                } else {
                    // Insert (GenieACS Only scenario)
                    let status = 'unknown';
                    if (dev._lastInform) {
                        const lastInform = new Date(dev._lastInform);
                        const diff = Date.now() - lastInform.getTime();
                        if (diff < 300000) status = 'online'; // 5 mins
                        else status = 'offline';
                    }

                    const [newOnu] = await db.insert(onus).values({
                        sn: sn,
                        routerId: resolvedRouterId,
                        tenantId: tenantId,
                        name: `ACS-${sn.slice(-4)}`,
                        model: dev._productClass,
                        ssid: dev._ssid,
                        firmwareVersion: dev._softwareVersion,
                        host: dev._ip,
                        lastRxPower: dev._rxPower,
                        macAddress: dev._macAddress,
                        status: status as any,
                        discoverySources: ['acs'],
                        lastSeen: dev._lastInform ? new Date(dev._lastInform) : undefined,
                    }).returning();
                    
                    if (newOnu) targetOnuId = newOnu.id;

                    // 📈 Log to Performance History for Charts (ACS Only scenario)
                    if (dev._rxPower && newOnu && resolvedRouterId) {
                        const parsedSignal = oltService.parseSignal(dev._rxPower);
                        if (parsedSignal !== null) {
                            await db.insert(devicePerformanceHistory).values({
                                tenantId: tenantId || '',
                                routerId: resolvedRouterId,
                                onuId: newOnu.id,
                                signal: parsedSignal,
                                recordedAt: new Date()
                            }).execute().catch((err: any) => logger.error({ err, sn }, 'Failed to record ACS signal history'));
                        }
                    }
                    added++;
                }

                // AUTO-LINK: Update the routerNetwatch linkedOnuId if we matched by IP
                if (dev._ip && targetOnuId) {
                    try {
                        await db.update(routerNetwatch)
                            .set({ linkedOnuId: targetOnuId })
                            .where(eq(routerNetwatch.host, dev._ip));
                    } catch (e) {
                        logger.error({ err: e, ip: dev._ip }, 'Failed to link routerNetwatch to ACS ONU');
                    }
                }
            }
            logger.info({ total, added, updated }, 'GenieACS: Metadata sync completed');
            return { added, updated, total };

        } catch (error) {
            console.error('Auto restore failed:', error);
            return { success: false, error: (error as any).message };
        }
    },

    /**
     * Restore device configuration manually
     */
    restoreDeviceManual: async (deviceId: string, config: any, routerId?: string, tenantId?: string) => {
        try {
            // 1. Update WAN Configuration (Optional if only updating WiFi)
            if (config.vlanId) {
                const isBridge = (config.connectionType === 'Bridge' || config.connectionMode === 'bridge');
                const wanType = config.connectionType === 'PPPoE' ? 'pppoe' : 'ip';

                await genieacsService.updateWanConfig(deviceId, {
                    wanType,
                    connectionMode: isBridge ? 'bridge' : 'route',
                    vlanId: parseInt(config.vlanId),
                    bindPorts: config.bindPorts,
                    username: config.pppoeUser,
                    password: config.pppoePass,
                    dhcpServerEnable: config.dhcpServerEnable,
                    connectionPath: config.connectionPath,
                    enable: true
                }, routerId, tenantId);
            }

            // 2. Update WiFi Configuration (if provided)
            if (config.ssid || config.wifiPass || config.ssidIndex) {
                if (config.ssidIndex) {
                    // Targeted SSID update (e.g. user selected WLAN 1-8)
                    await genieacsService.updateWifiConfig(deviceId, {
                        ssidIndex: config.ssidIndex,
                        ssid: config.ssid,
                        password: config.wifiPass,
                        enable: config.enable !== undefined ? config.enable : true,
                        securityMode: config.securityMode || 'WPA2-PSK'
                    }, routerId, tenantId);
                } else {
                    // Legacy behavior: Update both 1 (2.4GHz) and 5 (5GHz) with same creds
                    await genieacsService.updateWifiConfig(deviceId, {
                        ssidIndex: 1,
                        ssid: config.ssid,
                        password: config.wifiPass,
                        enable: true,
                        securityMode: config.securityMode || 'WPA2-PSK'
                    }, routerId, tenantId);

                    await genieacsService.updateWifiConfig(deviceId, {
                        ssidIndex: 5,
                        ssid: config.ssid,
                        password: config.wifiPass,
                        enable: true,
                        securityMode: config.securityMode || 'WPA2-PSK'
                    }, routerId, tenantId).catch(() => {});
                }
            }

            // 3. Update ONU record in DB for future reference
            const device = await genieacsService.getDevice(deviceId, routerId, tenantId);
            if (device?._deviceId?._SerialNumber) {
                await db.update(onus)
                    .set({ 
                        pppoeUser: config.pppoeUser, 
                        pppoePass: config.pppoePass,
                        vlanId: parseInt(config.vlanId)
                    })
                    .where(eq(onus.sn, device._deviceId._SerialNumber));
            }

            return { success: true };
        } catch (error) {
            console.error('Manual restore failed:', error);
            return { success: false, error: (error as any).message };
        }
    },

    /**
     * Get single device details
     */
    getDevice: async (deviceId: string, routerId?: string, tenantId?: string) => {
        const cacheKey = `genieacs:device:${deviceId}`;
        const cached = cacheService.get<any>(cacheKey);
        if (cached) return cached;

        try {
            const config = await getGenieAcsConfig(routerId, tenantId);
            if (!config) return null;
            const { url, auth, isDedicated } = config;

            // Use query to avoid 405 Method Not Allowed on some GenieACS versions
            const query: any = { _id: deviceId };

            // Security: If shared ACS (!isDedicated), verify Serial Number belongs to router
            if (routerId && !isDedicated) {
                const routerOnus = await db
                    .select({ sn: onus.sn })
                    .from(onus)
                    .innerJoin(olts, eq(onus.oltId, olts.id))
                    .where(eq(olts.parentId, routerId));

                const snFilter = routerOnus.map((o: any) => o.sn).filter(Boolean);
                if (snFilter.length > 0) {
                    query['_deviceId._SerialNumber'] = { '$in': snFilter };
                } else {
                    return null;
                }
            }

            const response = await axios.get(`${url}/devices`, {
                params: {
                    query: JSON.stringify(query)
                },
                auth,
                timeout: 5000
            });

            if (response.data && response.data.length > 0) {
                const device = transformGenieACSDevice(response.data[0]);
                cacheService.set(cacheKey, device, cacheService.TTL.GENIEACS_DEVICE);
                return device;
            }
            return null;
        } catch (error) {
            if (axios.isAxiosError(error)) {
                logger.error({
                    deviceId,
                    status: error.response?.status,
                    data: error.response?.data
                }, 'GenieACS Device Error');
            } else {
                logger.error({ deviceId, err: error }, 'GenieACS Device Error');
            }
            return null;
        }
    },

    /**
     * Update WAN Configuration
     */
    updateWanConfig: async (deviceId: string, config: WanConfigPayload, routerId?: string, tenantId?: string) => {
        try {
            const acsConfig = await getGenieAcsConfig(routerId, tenantId);
            if (!acsConfig) return { success: false, error: 'GenieACS: No configuration found' };
            const { url, auth } = acsConfig;
            const encodedId = encodeURIComponent(deviceId);

            // Fetch device first to determine TR version and driver
            const device = await genieacsService.getDevice(deviceId, routerId, tenantId);
            if (!device) {
                return { success: false, error: 'Device not found' };
            }
            const driver = findDriver(device);
            const rootPath = driver?.rootPath || (!!device.Device ? 'Device.' : 'InternetGatewayDevice.');

            // 1. Prepare Global Parameters
            const globalParams: [string, any, string?][] = [];
            const addGlobalParam = (path: string, val: any, type: string = 'xsd:string') => {
                globalParams.push([path, val, type]);
            };

            if (config.dhcpServerEnable !== undefined) {
                const lanPath = rootPath === 'Device.' ? 'Device.WiFi.Radio.1.' : 'InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.';
                addGlobalParam(lanPath + (rootPath === 'Device.' ? 'Enable' : 'DHCPServerEnable'), config.dhcpServerEnable, 'xsd:boolean');
            }

            // Allow driver to add global parameters if needed (e.g. Remote Access)
            if (driver?.onGlobalUpdate) {
                driver.onGlobalUpdate(globalParams, config, device, addGlobalParam);
            }

            if (globalParams.length > 0) {
                logger.info({ deviceId, params: globalParams }, 'GenieACS: Sending global parameters');
                await axios.post(`${url}/devices/${encodedId}/tasks?connection_request`, {
                    name: 'setParameterValues',
                    parameterValues: globalParams
                }, { auth }).catch(err => logger.error({ err: err.message }, 'Failed to send global params'));
            }

            // 2. Identify target connection path
            let connectionPath = config.connectionPath;
            if (!connectionPath) {
                const connections = getWanConnections(device);
                const isBridge = config.connectionMode === 'bridge';
                const existing = connections.find(c => {
                    const name = (c.name || '').toUpperCase();
                    // ZTE Logic: Detect existing INTERNET or BRIDGE connections
                    const isInternet = name.includes('INTERNET') || name.includes('WAN');
                    const isBridgeConn = isBridge && name.includes('BRIDGE');
                    return (isInternet || isBridgeConn) && c.type === (config.wanType === 'pppoe' ? 'PPPoE' : 'IP');
                });
                if (existing) connectionPath = existing.path;
            }
            
            // If still no path, create a new one
            if (!connectionPath) {
                const connectionDevicePath = `${rootPath}WANDevice.1.WANConnectionDevice`;
                const wcdIndex = driver?.getNewWcdIndex ? driver.getNewWcdIndex(device) : 1;
                const targetWcdPath = `${connectionDevicePath}.${wcdIndex}`;
                
                // Sub-interface Selection
                const subInterfaceName = config.wanType === 'pppoe' ? 'WANPPPConnection' : 'WANIPConnection';
                
                try {
                    // Check if the ConnectionDevice already exists first to avoid 9002 on "addObject"
                    const root = device.InternetGatewayDevice || device.Device;
                    const exists = !!root?.WANDevice?.['1']?.WANConnectionDevice?.[wcdIndex.toString()];

                    if (!exists) {
                        logger.info({ deviceId, path: connectionDevicePath }, 'GenieACS: Adding WANConnectionDevice');
                        await axios.post(`${url}/devices/${encodedId}/tasks`, {
                            name: 'addObject',
                            objectName: connectionDevicePath
                        }, { auth });
                    }

                    logger.info({ deviceId, path: `${targetWcdPath}.${subInterfaceName}` }, 'GenieACS: Adding sub-interface');
                    await axios.post(`${url}/devices/${encodedId}/tasks`, {
                        name: 'addObject',
                        objectName: `${targetWcdPath}.${subInterfaceName}`
                    }, { auth });
                    
                    // Dynamic sub-interface index finding
                    const wcd = root?.WANDevice?.['1']?.WANConnectionDevice?.[wcdIndex.toString()];
                    const existingSubConns = wcd ? (wcd[subInterfaceName] || {}) : {};
                    const subIndices = Object.keys(existingSubConns).map(k => parseInt(k)).filter(n => !isNaN(n));
                    const nextSubIdx = subIndices.length > 0 ? Math.max(...subIndices) + 1 : 1;
                    
                    connectionPath = `${targetWcdPath}.${subInterfaceName}.${nextSubIdx}`;
                } catch (e) {
                    logger.error({ err: e }, 'GenieACS: Failed to create WAN object');
                    connectionPath = `${targetWcdPath}.${subInterfaceName}.1`;
                }
            }

            // 3. Prepare WAN Parameters
            const parameters: [string, any, string?][] = [];
            const addParam = (path: string, val: any, type: string = 'xsd:string') => {
                parameters.push([`${connectionPath}.${path}`, val, type]);
            };

            // Delegate model-specific parameters to driver
            if (driver?.onWanUpdate) {
                driver.onWanUpdate(parameters, config, device, addParam);
            }

            // Common parameters
            if (config.enable !== undefined && !parameters.some(p => p[0].endsWith('.Enable'))) {
                addParam('Enable', config.enable, 'xsd:boolean');
            }

            if (config.bindPorts && !parameters.some(p => p[0].includes('BindPort') || p[0].includes('Binding') || p[0].includes('Interface'))) {
                addParam('X_CT-COM_BindPort', config.bindPorts);
            }

            if (config.wanType === 'pppoe') {
                if (config.username) addParam('Username', config.username);
                if (config.password) addParam('Password', config.password);

                const isBridge = config.connectionMode === 'bridge';
                addParam('ConnectionType', isBridge ? 'PPPoE_Bridged' : 'PPPoE_Routed');

                const hasNatParam = parameters.some(p => p[0].endsWith('.NATEnabled') || p[0].endsWith('.NATEnable'));
                if (!hasNatParam && !(config as any)._skipNat) {
                    addParam('NATEnabled', !isBridge, 'xsd:boolean');
                }
            } else {
                const isBridge = config.connectionMode === 'bridge';
                addParam('ConnectionType', isBridge ? 'IP_Bridged' : 'IP_Routed');

                const hasNatParam = parameters.some(p => p[0].endsWith('.NATEnabled') || p[0].endsWith('.NATEnable'));
                if (!hasNatParam && !(config as any)._skipNat) {
                    addParam('NATEnabled', !isBridge, 'xsd:boolean');
                }

                if (config.addressingType) addParam('AddressingType', config.addressingType);
                if (config.addressingType === 'Static') {
                    if (config.ipAddress) addParam('ExternalIPAddress', config.ipAddress);
                    if (config.subnetMask) addParam('SubnetMask', config.subnetMask);
                    if (config.defaultGateway) addParam('DefaultGateway', config.defaultGateway);
                    if (config.dnsServers) addParam('DNSServers', config.dnsServers);
                }
            }

            if (parameters.length === 0 && globalParams.length === 0) {
                return { success: false, error: 'No parameters to update' };
            }
            
            if (parameters.length === 0) {
                return { success: true, message: 'Global parameters updated' };
            }

            const response = await axios.post(`${url}/devices/${encodedId}/tasks?timeout=3000&connection_request`, {
                name: 'setParameterValues',
                parameterValues: parameters
            }, { auth });

            // Invalidate cache and refresh
            cacheService.delete(`genieacs:device:${deviceId}`);
            cacheService.invalidatePrefix('genieacs:devices');
            
            if (response.status < 300) {
                axios.post(`${url}/devices/${encodedId}/tasks?connection_request`, {
                    name: 'refreshObject',
                    objectName: connectionPath
                }, { auth }).catch(() => { });
            }

            return { success: true, taskId: response.data?._id };
        } catch (error) {
            console.error(`GenieACS updateWanConfig Error:`, error instanceof Error ? error.message : error);
            return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
        }
    },

    /**
     * Delete a WAN Connection instance
     */
    deleteWanConnection: async (deviceId: string, connectionPath: string, routerId?: string, tenantId?: string) => {
        try {
            // Safety: Never delete Management Index (WANConnectionDevice.1) or TR069 connections
            const isManagement = connectionPath.includes('.WANConnectionDevice.1.') || 
                               connectionPath.toUpperCase().includes('TR069') || 
                               connectionPath.toUpperCase().includes('MGMT');
                               
            if (isManagement) {
                return { success: false, error: 'Cannot delete management/primary connection for safety.' };
            }

            const acsConfig = await getGenieAcsConfig(routerId, tenantId);
            if (!acsConfig) return { success: false, error: 'GenieACS: No configuration found' };
            const { url, auth } = acsConfig;
            const encodedId = encodeURIComponent(deviceId);

            // Fetch device logic to detect driver
            const dev = await genieacsService.getDevice(deviceId, routerId, tenantId);
            let targetPath = connectionPath;
            
            if (dev) {
                const driver = findDriver(dev);
                if (driver?.onWanDelete) {
                    targetPath = driver.onWanDelete(deviceId, connectionPath);
                    logger.info({ original: connectionPath, refined: targetPath, driver: driver.name }, 'GenieACS: Refined delete path via driver');
                }
            }

            logger.info({ deviceId, targetPath }, 'GenieACS: Sending deleteObject task');

            const response = await axios.post(`${url}/devices/${encodedId}/tasks?connection_request`, {
                name: 'deleteObject',
                objectName: targetPath
            }, {
                auth
            });

            // Proactively refresh the parent object to ensure local GenieACS database updates
            const parentPath = targetPath.split('.').slice(0, -1).join('.');
            if (parentPath) {
                axios.post(`${url}/devices/${encodedId}/tasks?connection_request`, {
                    name: 'refreshObject',
                    objectName: parentPath
                }, { auth }).catch(() => {});
            }

            // Invalidate cache
            cacheService.delete(`genieacs:device:${deviceId}`);
            cacheService.invalidatePrefix('genieacs:devices');

            return { success: true, taskId: response.data?._id };
        } catch (error) {
            console.error('GenieACS deleteWanConnection Error:', error);
            return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
        }
    },

    /**
     * Update WiFi Configuration
     */
    updateWifiConfig: async (deviceId: string, config: WifiConfigPayload, routerId?: string, tenantId?: string) => {
        try {
            const acsConfig = await getGenieAcsConfig(routerId, tenantId);
            if (!acsConfig) return { success: false, error: 'GenieACS: No configuration found' };
            const { url, auth } = acsConfig;
            const encodedId = encodeURIComponent(deviceId);

            // Fetch device first to determine TR version / Manufacturer
            const device = await genieacsService.getDevice(deviceId, routerId);
            if (!device) {
                return { success: false, error: 'Device not found' };
            }

            const driver = findDriver(device);
            const isTr181 = driver?.rootPath === 'Device.' || (!!device.Device);
            const rootPrefix = driver?.rootPath || (isTr181 ? 'Device.' : 'InternetGatewayDevice.');
            const index = config.ssidIndex || 1;
            
            const basePath = isTr181 
                ? `Device.WiFi.SSID.${index}` 
                : `InternetGatewayDevice.LANDevice.1.WLANConfiguration.${index}`;

            logger.info({ path: basePath, driver: driver?.name }, 'GenieACS WiFi-Config: Target path');

            const parameters: [string, any, string?][] = [];
            const addParam = (path: string, val: any, type: string = 'xsd:string') => {
                parameters.push([`${basePath}.${path}`, val, type]);
            };

            // 1. Common Parameters
            if (config.enable !== undefined) {
                addParam('Enable', config.enable, 'xsd:boolean');
                // Delegate radio toggle to driver if needed (e.g. ZTE)
                if (driver?.onWifiUpdate) {
                    driver.onWifiUpdate(parameters, config, device, addParam);
                }
            }
            if (config.ssid) addParam('SSID', config.ssid);

            // 2. Security & Password
            // Note: TR-098 puts KeyPassphrase in WLANConfiguration.
            // TR-181 puts it in Device.WiFi.AccessPoint.{i}.Security.

            if (config.password) {
                if (isTr181) {
                    // For TR-181, Security usually in AccessPoint
                    parameters.push([`Device.WiFi.AccessPoint.${index}.Security.KeyPassphrase`, config.password, 'xsd:string']);
                } else {
                    // TR-098
                    addParam('KeyPassphrase', config.password);
                    addParam('PreSharedKey', [config.password]); // Some devices use PreSharedKey
                }
            }

            // 3. Configuration (BeaconType, Encryption) -> TR-098
            if (!isTr181) {
                if (config.securityMode && !parameters.some(p => p[0].endsWith('.BeaconType'))) {
                    // Map UI modes to TR-069
                    if (config.securityMode === 'Open' || config.securityMode === 'None') {
                        addParam('BeaconType', 'None');
                        addParam('BasicAuthenticationMode', 'None');
                        // Reset encryption for Open mode
                        addParam('WPAEncryptionModes', 'None');
                        addParam('IEEE11iEncryptionModes', 'None');
                    } else if (config.securityMode === 'WPA2-PSK' || config.securityMode === '11i' || config.securityMode === 'WPAand11i') {
                        addParam('BeaconType', '11i'); // Standard for WPA2
                        addParam('BasicAuthenticationMode', 'None');
                        addParam('WPAAuthenticationMode', 'PSKAuthentication');
                        addParam('IEEE11iAuthenticationMode', 'PSKAuthentication');
                        addParam('IEEE11iEncryptionModes', 'AESEncryption');
                        if (!config.encryption) {
                            addParam('WPAEncryptionModes', 'AESEncryption');
                            addParam('IEEE11iEncryptionModes', 'AESEncryption');
                        }
                    } else if (config.securityMode === 'WPA-PSK') {
                        addParam('BeaconType', 'WPA');
                        addParam('BasicAuthenticationMode', 'None');
                        addParam('WPAAuthenticationMode', 'PSKAuthentication');
                        if (!config.encryption) {
                            addParam('WPAEncryptionModes', 'AESEncryption');
                        }
                    } else if (config.securityMode === 'WPA-WPA2-Mixed') {
                        addParam('BeaconType', 'WPAand11i');
                        addParam('BasicAuthenticationMode', 'None');
                        addParam('WPAAuthenticationMode', 'PSKAuthentication');
                        addParam('IEEE11iAuthenticationMode', 'PSKAuthentication');
                        if (!config.encryption) {
                            addParam('WPAEncryptionModes', 'TKIPandAESEncryption');
                            addParam('IEEE11iEncryptionModes', 'TKIPandAESEncryption');
                        }
                    }
                }

                if (config.encryption && config.securityMode !== 'Open') {
                    if (config.encryption === 'AES') {
                        addParam('WPAEncryptionModes', 'AESEncryption');
                        addParam('IEEE11iEncryptionModes', 'AESEncryption');
                    } else if (config.encryption === 'TKIP+AES' || config.encryption === 'TKIPandAES') {
                        addParam('WPAEncryptionModes', 'TKIPandAESEncryption');
                        addParam('IEEE11iEncryptionModes', 'TKIPandAESEncryption');
                    }
                }

                // Hidden SSID
                if (config.hidden !== undefined) {
                    // SSIDAdvertisementEnabled: true = broadcast (visible), false = hidden
                    addParam('SSIDAdvertisementEnabled', !config.hidden, 'xsd:boolean');
                    addParam('BeaconAdvertisementEnabled', !config.hidden, 'xsd:boolean'); // Added for some FH models
                }

                // Channel
                if (config.channel) {
                    if (config.channel === 'Auto') {
                        addParam('AutoChannelEnable', true, 'xsd:boolean');
                    } else {
                        addParam('AutoChannelEnable', false, 'xsd:boolean');
                        addParam('Channel', config.channel, 'xsd:unsignedInt');
                    }
                }
            } else {
                // TR-181 logic (Security in AccessPoint)
                // Device.WiFi.AccessPoint.{i}.Security.ModeEnabled: None, WPA2-Personal, etc.
                if (config.securityMode) {
                    const apPath = `Device.WiFi.AccessPoint.${index}.Security`;
                    if (config.securityMode === 'Open' || config.securityMode === 'None') {
                        parameters.push([`${apPath}.ModeEnabled`, 'None']);
                    } else if (config.securityMode === 'WPA2-PSK') {
                        parameters.push([`${apPath}.ModeEnabled`, 'WPA2-Personal']);
                    }
                }

                // Hidden SSID (TR-181)
                if (config.hidden !== undefined) {
                    addParam('SSIDAdvertisementEnabled', !config.hidden, 'xsd:boolean');
                }
            }

            if (parameters.length === 0) {
                return { success: false, error: 'No parameters to update' };
            }

            logger.info({ deviceId }, 'GenieACS: Updating WiFi config');

            // Invalidate cache
            cacheService.delete(`genieacs:device:${deviceId}`);
            cacheService.invalidatePrefix('genieacs:devices');

            const response = await axios.post(`${url}/devices/${encodedId}/tasks?timeout=3000&connection_request`, {
                name: 'setParameterValues',
                parameterValues: parameters
            }, {
                auth
            });

            // Proactively refresh the object to see changes immediately
            if (response.status < 300) {
                axios.post(`${url}/devices/${encodedId}/tasks?connection_request`, {
                    name: 'refreshObject',
                    objectName: basePath
                }, { auth }).catch(() => { });
            }

            return { success: true, taskId: response.data?._id };

        } catch (error) {
            logger.error({ deviceId, err: error }, 'GenieACS updateWifiConfig Error');
            return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
        }
    },

    /**
     * Reboot device
     */
    rebootDevice: async (deviceId: string, routerId?: string, tenantId?: string) => {
        try {
            const config = await getGenieAcsConfig(routerId, tenantId);
            if (!config) return { success: false, error: 'GenieACS: No configuration found' };
            const { url, auth } = config;
            const encodedId = encodeURIComponent(deviceId);
            await axios.post(`${url}/devices/${encodedId}/tasks?timeout=3000&connection_request`, {
                name: 'reboot'
            }, {
                auth
            });

            // Invalidate cache
            cacheService.delete(`genieacs:device:${deviceId}`);
            cacheService.invalidatePrefix('genieacs:devices');

            return { success: true };
        } catch (error) {
            return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
        }
    },

    /**
     * Update device parameters (TR-069 setParameterValues)
     */
    setParameter: async (deviceId: string, parameterName: string, value: any, type: string = 'xsd:string', routerId?: string, tenantId?: string) => {
        try {
            const config = await getGenieAcsConfig(routerId, tenantId);
            if (!config) return { success: false, error: 'GenieACS: No configuration found' };
            const { url, auth } = config;
            const encodedId = encodeURIComponent(deviceId);
            await axios.post(`${url}/devices/${encodedId}/tasks?timeout=3000&connection_request`, {
                name: 'setParameterValues',
                parameterValues: [[parameterName, value, type]]
            }, {
                auth
            });

            // Invalidate cache
            cacheService.delete(`genieacs:device:${deviceId}`);
            cacheService.invalidatePrefix('genieacs:devices');

            return { success: true };
        } catch (error) {
            logger.error({ deviceId, parameterName, err: error }, 'GenieACS setParameter Error');
            return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
        }
    },

    /**
     * Update Management Server (ACS) Settings
     * Used for migrating devices to local ACS
     */
    updateAcsSettings: async (deviceId: string, settings: { url: string, username?: string, password?: string }, routerId?: string, tenantId?: string) => {
        try {
            const device = await genieacsService.getDevice(deviceId, routerId, tenantId);
            if (!device) return { success: false, error: 'Device not found' };

            const driver = findDriver(device);
            const root = driver?.rootPath || (!!device.Device ? 'Device.' : 'InternetGatewayDevice.');
            const basePath = `${root}ManagementServer`;

            const parameters: [string, any, string?][] = [
                [`${basePath}.URL`, settings.url, 'xsd:string']
            ];

            if (settings.username) parameters.push([`${basePath}.Username`, settings.username, 'xsd:string']);
            if (settings.password) parameters.push([`${basePath}.Password`, settings.password, 'xsd:string']);

            const acsConfig = await getGenieAcsConfig(routerId, tenantId);
            if (!acsConfig) return { success: false, error: 'GenieACS: No configuration found' };
            const { url, auth } = acsConfig;
            const encodedId = encodeURIComponent(deviceId);

            const response = await axios.post(`${url}/devices/${encodedId}/tasks?connection_request`, {
                name: 'setParameterValues',
                parameterValues: parameters
            }, { auth });

            return { success: true, taskId: response.data?._id };
        } catch (error) {
            logger.error({ deviceId, err: error }, 'GenieACS updateAcsSettings Error');
            return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
        }
    },

    /**
     * Refresh Device (Summon)
     */
    refreshDevice: async (deviceId: string, routerId?: string, tenantId?: string) => {
        try {
            const config = await getGenieAcsConfig(routerId, tenantId);
            if (!config) return { success: false, error: 'GenieACS: No configuration found' };
            const { url, auth } = config;
            const encodedId = encodeURIComponent(deviceId);

            // Refresh entire objects for better reliability instead of specific params
            const objectsToRefresh = [
                'InternetGatewayDevice.DeviceInfo',
                'Device.DeviceInfo',
                'InternetGatewayDevice.Hosts',
                'Device.Hosts',
                'InternetGatewayDevice.WANDevice.1.X_ZTE-COM_WANDevice.1.OpticalModuleInfo',
                'InternetGatewayDevice.WANDevice.1.X_HUWEI_WANDevice.1.OpticalModuleInfo',
                'InternetGatewayDevice.WANDevice.1.X_FH_GponInterfaceConfig',
                'InternetGatewayDevice.LANDevice.1.WLANConfiguration'
            ];

            for (const objectName of objectsToRefresh) {
                try {
                    await axios.post(`${url}/devices/${encodedId}/tasks?timeout=1500&connection_request`, {
                        name: 'refreshObject',
                        objectName: objectName
                    }, { auth }).catch(() => { }); // Ignore individual failures if path doesn't exist
                } catch (e) { }
            }

            // Also refresh common signal paths specifically
            const signalParams = [
                'InternetGatewayDevice.WANDevice.1.X_ZTE-COM_WANDevice.1.OpticalModuleInfo.RXPower',
                'InternetGatewayDevice.WANDevice.1.X_HUWEI_WANDevice.1.OpticalModuleInfo.RXPower'
            ];

            await axios.post(`${url}/devices/${encodedId}/tasks?timeout=3000&connection_request`, {
                name: 'getParameterValues',
                parameterNames: signalParams
            }, { auth }).catch(() => { });

            // Force immediate update task for temperature sensing if possible
            await axios.post(`${url}/devices/${encodedId}/tasks?timeout=1500&connection_request`, {
                name: 'refreshObject',
                objectName: 'InternetGatewayDevice.WANDevice.1.X_ZTE-COM_WANDevice.1.OpticalModuleInfo'
            }, { auth }).catch(() => { });

            return { success: true };
        } catch (error) {
            logger.error({ deviceId, err: error }, 'GenieACS refreshDevice Error');
            // Fallback to simple refreshObject if getParameterValues fails (e.g., too many params)
            try {
                const config = await getGenieAcsConfig(routerId, tenantId);
                if (!config) return { success: false, error: 'GenieACS: No configuration found' };
                const { url, auth } = config;
                const encodedId = encodeURIComponent(deviceId);
                await axios.post(`${url}/devices/${encodedId}/tasks?timeout=3000&connection_request`, {
                    name: 'refreshObject',
                    objectName: ''
                }, { auth });

                // Invalidate cache
                cacheService.delete(`genieacs:device:${deviceId}`);
                cacheService.invalidatePrefix('genieacs:devices');

                return { success: true };
            } catch (retryError) {
                return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
            }
        }
    },

    /**
     * Factory Reset
     */
    factoryReset: async (deviceId: string, routerId?: string, tenantId?: string) => {
        try {
            const config = await getGenieAcsConfig(routerId, tenantId);
            if (!config) return { success: false, error: 'GenieACS: No configuration found' };
            const { url, auth } = config;
            const encodedId = encodeURIComponent(deviceId);
            await axios.post(`${url}/devices/${encodedId}/tasks?timeout=3000&connection_request`, {
                name: 'factoryReset'
            }, {
                auth
            });
            return { success: true };
        } catch (error) {
            return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
        }
    },

    /**
     * Bulk Reboot
     */
    bulkReboot: async (deviceIds: string[], routerId?: string, tenantId?: string) => {
        const results = { success: 0, failed: 0, errors: [] as string[] };

        await Promise.all(deviceIds.map(async (id) => {
            const res = await genieacsService.rebootDevice(id, routerId, tenantId);
            if (res.success) {
                results.success++;
            } else {
                results.failed++;
                results.errors.push(`Device ${id}: ${res.error}`);
            }
        }));

        return results;
    },

    /**
     * Bulk Push Config
     */
    bulkPushConfig: async (deviceIds: string[], type: 'wan' | 'wifi', config: any, routerId?: string, tenantId?: string) => {
        const results = { success: 0, failed: 0, errors: [] as string[] };

        // Process in chunks to avoid overwhelming the server if list is huge? 
        // For now, Promise.all is fine for reasonable numbers (<100)

        await Promise.all(deviceIds.map(async (id) => {
            let res;
            if (type === 'wan') {
                res = await genieacsService.updateWanConfig(id, config as WanConfigPayload, routerId);
            } else if (type === 'wifi') {
                res = await genieacsService.updateWifiConfig(id, config as WifiConfigPayload, routerId);
            } else {
                res = { success: false, error: 'Invalid config type' };
            }

            if (res.success) {
                results.success++;
            } else {
                results.failed++;
                results.errors.push(`Device ${id}: ${res.error}`);
            }
        }));

        return results;
    },

    /**
     * Get ACS Dashboard Statistics (Warming friendly)
     */
    getDashboardStats: async (routerId?: string, tenantId?: string, force = false) => {
        const cacheKey = `genieacs:stats:${tenantId || 'all'}:${routerId || 'all'}`;

        if (!force) {
            const cached = cacheService.get<any>(cacheKey);
            if (cached) return cached;
        }

        const config = await getGenieAcsConfig(routerId, tenantId);
        if (!config) {
            return {
                total: 0,
                online: 0,
                offline: 0,
                avgUptimeSeconds: 0,
                signalDistribution: { excellent: 0, good: 0, fair: 0, poor: 0, noSignal: 0 },
                vendorDistribution: {},
                modelDistribution: {},
                recentActivity: []
            };
        }

        // Use 'stats' projection mode for faster performance
        const devices = await genieacsService.getDevices(routerId, tenantId, {}, force, 'stats');

        const stats = {
            total: devices.length,
            online: 0,
            offline: 0,
            avgUptimeSeconds: 0,
            signalDistribution: {
                excellent: 0, // > -20
                good: 0,      // -20 to -24
                fair: 0,      // -25 to -27
                poor: 0,      // < -27
                noSignal: 0
            },
            vendorDistribution: {} as Record<string, number>,
            modelDistribution: {} as Record<string, number>,
            recentActivity: devices
                .filter(d => d._lastInform)
                .sort((a, b) => new Date(b._lastInform).getTime() - new Date(a._lastInform).getTime())
                .slice(0, 10)
        };

        devices.forEach(dev => {
            const lastInform = dev._lastInform ? new Date(dev._lastInform).getTime() : 0;
            const isOnline = lastInform > Date.now() - 5 * 60 * 1000;

            if (isOnline) stats.online++;
            else stats.offline++;

            const rxPower = parseFloat(dev._rxPower || '0');
            if (!dev._rxPower || rxPower === 0) stats.signalDistribution.noSignal++;
            else if (rxPower >= -20) stats.signalDistribution.excellent++;
            else if (rxPower >= -24) stats.signalDistribution.good++;
            else if (rxPower >= -27) stats.signalDistribution.fair++;
            else stats.signalDistribution.poor++;

            const vendor = dev._manufacturer || 'Unknown';
            stats.vendorDistribution[vendor] = (stats.vendorDistribution[vendor] || 0) + 1;

            const model = dev._productClass || 'Unknown';
            stats.modelDistribution[model] = (stats.modelDistribution[model] || 0) + 1;
        });

        // Set cache for 65s (matches warmer interval + buffer)
        cacheService.set(cacheKey, stats, cacheService.TTL.GENIEACS_DEVICES);

        return stats;
    },

    /**
     * Test connection to GenieACS
     */
    testConnection: async (routerId?: string) => {
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
    },

    /**
     * Get all backups for a device
     */
    getBackups: async (onuId: string, modelOverride?: string) => {
        // First get the device to know its vendor/model
        const [onu] = await db.select().from(onus).where(eq(onus.id, onuId)).limit(1);
        if (!onu) return [];

        const targetModel = (modelOverride || onu.model || '').replace(/^ONU_|^GPON_|^EPON_/g, '');

        // Return backups for this specific ONU OR backups for the same model (templates)
        return db.select()
            .from(genieacsBackups)
            .where(
                or(
                    eq(genieacsBackups.onuId, onuId),
                    and(
                        eq(genieacsBackups.model, targetModel),
                        eq(genieacsBackups.type, 'snapshot')
                    )
                )
            )
            .orderBy(desc(genieacsBackups.createdAt));
    },

    /**
     * Create a backup for a device
     */
    backupDevice: async (deviceId: string, name: string, routerId?: string, tenantId?: string) => {
        try {
            const device = await genieacsService.getDevice(deviceId, routerId, tenantId);
            if (!device) return { success: false, error: 'Device not found' };

            const onusRecord = await db.select().from(onus).where(eq(onus.sn, device._deviceId._SerialNumber)).limit(1);
            if (onusRecord.length === 0) return { success: false, error: 'ONU not found in database' };

            const onu = onusRecord[0];
            const config: Record<string, any> = {};

            // Extract WAN config (Full Detail)
            const connections = getWanConnections(device);
            config.wan = connections.map(c => ({
                name: c.name,
                type: c.type,
                mode: c.mode, // Bridge / Route
                vlanId: c.vlanId,
                vlanEnable: c.vlanEnable,
                serviceList: c.serviceList,
                bindPorts: c.bindPorts,
                username: '{{PPPOE_USER}}',
                password: '{{PPPOE_PASS}}',
            }));

            // Extract WiFi config
            config.wifi = {
                ssid: getDeviceSsid(device),
                password: '{{WIFI_PASS}}'
            };

            await db.insert(genieacsBackups).values({
                onuId: onu.id,
                sn: onu.sn,
                vendor: (device._deviceId?._Manufacturer || 'Unknown').toLowerCase(),
                model: (device._deviceId?._ProductClass || '').replace(/^ONU_|^GPON_|^EPON_/g, ''),
                name: name,
                type: 'snapshot' as any,
                config: config,
            });

            return { success: true };
        } catch (error) {
            logger.error({ deviceId, err: error }, 'GenieACS backupDevice Error');
            return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
        }
    },

    /**
     * Delete a backup
     */
    deleteBackup: async (backupId: string, tenantId?: string) => {
        try {
            // Since genieacsBackups doesn't store tenantId directly, 
            // we delete by ID. Security is handled by the route layer verifying device access.
            await db.delete(genieacsBackups).where(eq(genieacsBackups.id, backupId));
            return { success: true };
        } catch (error) {
            logger.error({ backupId, err: error }, 'GenieACS deleteBackup Error');
            return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
        }
    },

    /**
     * Restore configuration (Auto Mode)
     */
    restoreDeviceAuto: async (deviceId: string, backupId: string, routerId?: string, tenantId?: string, selectedWanIndices?: number[]) => {
        try {
            const [backup] = await db.select().from(genieacsBackups).where(eq(genieacsBackups.id, backupId)).limit(1);
            if (!backup) return { success: false, error: 'Backup not found' };

            const device = await genieacsService.getDevice(deviceId, routerId, tenantId);
            if (!device) return { success: false, error: 'Target device not found' };

            const [onu] = await db.select().from(onus).where(eq(onus.sn, device._deviceId._SerialNumber)).limit(1);
            if (!onu) return { success: false, error: 'Target ONU record not found' };

            const backupConfig = backup.config as any;
            const connectionsToRestore = backupConfig.wan || [];

            // If indices are provided, filter the list. Otherwise, restore the FIRST one (legacy/default)
            // Or maybe restore ALL if no indices provided? User mentioned "prevent duplicate vlans",
            // so keeping it conservative (first one) if no selection is made seems safer.
            // Actually, if coming from the new UI, selectedWanIndices will always be there.
            const indices = selectedWanIndices || [0];
            const filteredConnections = connectionsToRestore.filter((_: any, idx: number) => indices.includes(idx));

            if (filteredConnections.length === 0) {
                return { success: false, error: 'No connections selected for restore' };
            }

            const results = [];
            for (const wan of filteredConnections) {
                // Determine Mode: Be robust with "PPPoE_Bridged" or "Bridge"
                const rawMode = (wan.mode || '').toLowerCase();
                const connectionMode = rawMode.includes('bridge') ? 'bridge' : 'route';
                
                const manualConfig: any = {
                    wanType: (wan.type || '').toLowerCase().includes('pppoe') ? 'pppoe' : 'ip',
                    connectionMode,
                    vlanId: parseInt(String(wan.vlanId)) || 0,
                    username: (onu as any).pppoeUser || '',
                    password: (onu as any).pppoePass || '',
                    serviceList: wan.serviceList || 'INTERNET',
                    bindPorts: (wan.bindPorts || []).join(','),
                    enable: true
                };

                logger.info({ deviceId, wanIndex: wan.v14_index, manualConfig }, 'GenieACS: Executing Auto-Restore Connection');
                const res = await genieacsService.updateWanConfig(deviceId, manualConfig, routerId, tenantId);
                results.push(res);
            }

            // If any failed, return the first error
            const failed = results.find(r => !r.success);
            if (failed) return failed;

            return { success: true, count: filteredConnections.length };
        } catch (error) {
            return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
        }
    },

};

/**
 * Unified Device Transformer
 */
function transformGenieACSDevice(dev: any) {
    return {
        _id: dev._id,
        _registered: dev._registered,
        _lastInform: dev._lastInform,
        _serialNumber: dev._deviceId?._SerialNumber,
        _productClass: (dev._deviceId?._ProductClass || '').replace(/^ONU_|^GPON_|^EPON_/g, ''),
        _manufacturer: (dev._deviceId?._Manufacturer || '').replace(/ Corporation| technology| co\.,ltd| Inc\.| Ltd\./gi, '').trim(),
        _softwareVersion: (dev._deviceId?._SoftwareVersion || 
                         dev.InternetGatewayDevice?.DeviceInfo?.SoftwareVersion?._value || 
                         dev.Device?.DeviceInfo?.SoftwareVersion?._value || '').trim(),
        _ip: getDeviceIp(dev),
        _pppoeIp: dev.VirtualParameters?.pppoeIP?._value || 
                 getWanConnections(dev).find(c => c.type === 'PPPoE')?.externalIp || '',
        _mgmtIp: dev.VirtualParameters?.IPTR069?._value || 
                dev.InternetGatewayDevice?.ManagementServer?.ConnectionRequestURL?._value?.match(/:\/\/(?:[a-zA-Z0-9-._~%]+@)?([0-9a-zA-Z.-]+)/)?.[1] || 
                getWanConnections(dev).find(c => c.name?.includes('TR069') || c.vlanId === 100)?.externalIp || '',
        _ssid: getDeviceSsid(dev),
        _rxPower: getDeviceRxPower(dev),
        _macAddress: getDeviceMac(dev),
        _isTr181: !!dev.Device,
        _uptime: getDeviceUptime(dev),
        _temperature: getDeviceTemperature(dev),
        _tags: dev._tags || [],
        _clientCount: getDeviceClientCount(dev),
        _vlan: Array.from(new Set(getWanConnections(dev).map(c => String(c.vlanId)).filter(v => v && v !== 'undefined' && v !== 'null'))).join(', '),
        _pppoeUser: getWanConnections(dev).find(c => c.type === 'PPPoE' && c.username)?.username || '',
        _wifiEnabled: (() => {
            const tr098 = dev.InternetGatewayDevice?.LANDevice?.['1']?.WLANConfiguration?.['1'];
            const tr181 = dev.Device?.WiFi?.SSID?.['1'];
            const enable = tr098?.Enable?._value ?? tr181?.Enable?._value;
            const status = tr098?.Status?._value ?? tr181?.Status?._value;
            return (enable === true || enable === '1' || enable === 'true') && (status === 'Up' || status === 'Enabled');
        })(),
        _wifiChannel: dev.InternetGatewayDevice?.LANDevice?.['1']?.WLANConfiguration?.['1']?.Channel?._value || 
                     dev.Device?.WiFi?.Radio?.['1']?.Channel?._value || 'Auto',
        _wanStatus: getWanConnections(dev).find(c => c.type === 'PPPoE' || c.type === 'IP')?.status || 'Disconnected',
        _hardwareVersion: dev.InternetGatewayDevice?.DeviceInfo?.HardwareVersion?._value ||
            dev.Device?.DeviceInfo?.HardwareVersion?._value || '',
        _wanConnections: getWanConnections(dev),
        // Keep raw data for advanced tabs
        ...dev
    };
}

function getDeviceIp(dev: any): string {
    // 1. Native GenieACS properties (if available in summary or projection)
    if (dev._ip) return dev._ip;
    // 2. Reliable TR-069 Connection Request URL (http://192.168.1.5:7547/)
    const connReqUrl1 = dev.InternetGatewayDevice?.ManagementServer?.ConnectionRequestURL?._value;
    const connReqUrl2 = dev.Device?.ManagementServer?.ConnectionRequestURL?._value;
    const url = connReqUrl1 || connReqUrl2;
    if (url && typeof url === 'string') {
        const match = url.match(/:\/\/(?:[a-zA-Z0-9-._~%]+@)?([0-9a-zA-Z.-]+)(?::[0-9]+)?/);
        if (match && match[1]) {
            return match[1];
        }
    }

    // 3. Fallbacks - Priority to Management IP for _ip field (connectivity check)
    return dev.VirtualParameters?.IPTR069?._value ||
        dev.InternetGatewayDevice?.WANDevice?.[1]?.WANConnectionDevice?.[1]?.WANIPConnection?.[1]?.ExternalIPAddress?._value ||
        dev.InternetGatewayDevice?.WANDevice?.[1]?.WANConnectionDevice?.[2]?.WANPPPConnection?.[1]?.ExternalIPAddress?._value ||
        dev.InternetGatewayDevice?.WANDevice?.[1]?.WANConnectionDevice?.[1]?.WANPPPConnection?.[1]?.ExternalIPAddress?._value ||
        '';
}

function getDeviceSsid(dev: any): string {
    return dev.InternetGatewayDevice?.LANDevice?.[1]?.WLANConfiguration?.[1]?.SSID?._value ||
        dev.Device?.WiFi?.SSID?.[1]?.SSID?._value ||
        '';
}

function getDeviceRxPower(dev: any): string {
    // 1. Priority: Virtual Parameter (Formatted)
    if (dev.VirtualParameters?.RXPower?._value) {
        return dev.VirtualParameters.RXPower._value;
    }

    // 2. Raw paths
    const rawValue = dev.InternetGatewayDevice?.WANDevice?.[1]?.['X_ZTE-COM_WANDevice']?.[1]?.OpticalModuleInfo?.RXPower?._value ||
        dev.InternetGatewayDevice?.WANDevice?.[1]?.['X_ZTE_COM_WANDevice']?.[1]?.OpticalModuleInfo?.RXPower?._value ||
        dev.InternetGatewayDevice?.WANDevice?.[1]?.['X_ZTE-COM_WANPONInterfaceConfig']?.RXPower?._value ||
        dev.InternetGatewayDevice?.WANDevice?.[1]?.['X_ZTE_COM_WANPONInterfaceConfig']?.RXPower?._value ||
        dev.InternetGatewayDevice?.WANDevice?.[1]?.['X_ZTE-COM_WANDevice']?.[1]?.OpticalInstance?.[1]?.OpticalSignalLevel?._value ||
        dev.InternetGatewayDevice?.WANDevice?.[1]?.['X_ZTE_COM_WANDevice']?.[1]?.OpticalInstance?.[1]?.OpticalSignalLevel?._value ||
        dev.InternetGatewayDevice?.WANDevice?.[1]?.One_Optical_Module_Info?.RXPower?._value ||
        dev.InternetGatewayDevice?.WANDevice?.[1]?.['X_ZTE-COM_ONU']?.[1]?.OpticalModuleInfo?.RXPower?._value ||
        dev.InternetGatewayDevice?.WANDevice?.[1]?.['X_ZTE_COM_ONU']?.[1]?.OpticalModuleInfo?.RXPower?._value ||
        dev.InternetGatewayDevice?.WANDevice?.[1]?.['X_ZTE-COM_WANDevice']?.[1]?.['X_ZTE-COM_Optical']?.[1]?.RxPower?._value ||
        dev.InternetGatewayDevice?.WANDevice?.[1]?.['X_ZTE_COM_WANDevice']?.[1]?.['X_ZTE_COM_Optical']?.[1]?.RxPower?._value ||
        dev.InternetGatewayDevice?.WANDevice?.[1]?.['X_HUWEI_WANDevice']?.[1]?.OpticalModuleInfo?.RXPower?._value ||
        dev.InternetGatewayDevice?.WANDevice?.[1]?.['X_HUWEI_WANDevice']?.[1]?.OpticalModuleInfo?.RXPower?._value ||
        dev.InternetGatewayDevice?.WANDevice?.[1]?.['X_FH_GponInterfaceConfig']?._value ||
        dev.InternetGatewayDevice?.WANDevice?.[1]?.['X_FH_GponInterfaceConfig']?.RXPower?._value ||
        dev.InternetGatewayDevice?.WANDevice?.[1]?.WANDSLInterfaceConfig?.DownstreamAttenuation?._value;

    if (rawValue === undefined || rawValue === null || rawValue === '') return '';

    // Convert to string and handle formatting if raw
    const strVal = String(rawValue);
    const num = Number(strVal);
    
    if (!strVal.includes('.') && !isNaN(num)) {
        const absNum = Math.abs(num);
        // Catch raw units (e.g., -192 for -19.2 or -2318 for -23.18)
        if (absNum > 500) return (num / 100).toFixed(2);
        if (absNum > 50) return (num / 10).toFixed(1);
    }

    return strVal;
}

function getDeviceMac(dev: any): string {
    return dev.VirtualParameters?.PonMac?._value ||
        dev.VirtualParameters?.pppoeMac?._value ||
        dev.VirtualParameters?.MACAddress?._value ||
        dev._mac ||
        dev.InternetGatewayDevice?.LANDevice?.[1]?.LANHostConfigManagement?.MACAddress?._value ||
        dev.InternetGatewayDevice?.WANDevice?.[1]?.WANConnectionDevice?.[2]?.WANPPPConnection?.[1]?.MACAddress?._value ||
        dev.InternetGatewayDevice?.WANDevice?.[1]?.WANConnectionDevice?.[3]?.WANIPConnection?.[1]?.MACAddress?._value ||
        dev.InternetGatewayDevice?.LANDevice?.[1]?.LANEthernetInterfaceConfig?.[1]?.MACAddress?._value ||
        dev.Device?.Ethernet?.Interface?.[1]?.MACAddress?._value ||
        '';
}

function getDeviceUptime(dev: any): string {
    const uptimeSeconds = dev.InternetGatewayDevice?.DeviceInfo?.UpTime?._value ||
        dev.Device?.DeviceInfo?.UpTime?._value || 0;

    if (!uptimeSeconds) return '';

    const days = Math.floor(uptimeSeconds / 86400);
    const hours = Math.floor((uptimeSeconds % 86400) / 3600);
    const minutes = Math.floor((uptimeSeconds % 3600) / 60);

    let parts = [];
    if (days > 0) parts.push(`${days} d`);
    if (hours > 0) parts.push(`${hours} h`);
    if (minutes > 0) parts.push(`${minutes} m`);

    return parts.join(' ') || `${uptimeSeconds}s`;
}

function getDeviceTemperature(dev: any): string {
    const temp = dev.VirtualParameters?.gettemp?._value ||
        dev.VirtualParameters?.Temperature?._value ||
        dev.InternetGatewayDevice?.DeviceInfo?.Temperature?._value ||
        dev.Device?.DeviceInfo?.Temperature?._value ||
        dev.Device?.DeviceInfo?.TemperatureStatus?.Temperature?._value ||
        dev.Device?.DeviceInfo?.Processors?.['1']?.Temperature?._value ||
        dev.InternetGatewayDevice?.WANDevice?.[1]?.['X_ZTE-COM_WANDevice']?.[1]?.OpticalModuleInfo?.Temperature?._value ||
        dev.InternetGatewayDevice?.WANDevice?.[1]?.['X_ZTE_COM_WANDevice']?.[1]?.OpticalModuleInfo?.Temperature?._value ||
        dev.InternetGatewayDevice?.WANDevice?.[1]?.['X_ZTE-COM_WANDevice']?.[1]?.['X_ZTE-COM_Optical']?.[1]?.Temperature?._value ||
        dev.InternetGatewayDevice?.WANDevice?.[1]?.['X_ZTE_COM_WANDevice']?.[1]?.['X_ZTE_COM_Optical']?.[1]?.Temperature?._value ||
        dev.InternetGatewayDevice?.WANDevice?.[1]?.['X_HUWEI_WANDevice']?.[1]?.OpticalModuleInfo?.Temperature?._value ||
        dev.InternetGatewayDevice?.['X_HW_WANDevice']?.[1]?.OpticalModuleInfo?.Temperature?._value ||
        dev.InternetGatewayDevice?.WANDevice?.[1]?.X_FH_GponInterfaceConfig?.TransceiverTemperature?._value ||
        dev.InternetGatewayDevice?.WANDevice?.[1]?.X_FH_GponInterfaceConfig?.Temperature?._value ||
        dev.InternetGatewayDevice?.WANDevice?.[1]?.X_FH_GponInterfaceConfig?.OpticalModuleTemp?._value ||
        '';

    if (temp === '' || temp === undefined || temp === null) return '';

    const strTemp = String(temp);
    if (!strTemp.includes('.') && strTemp.length > 2) {
        const numTemp = parseFloat(strTemp);
        if (numTemp > 500) return (numTemp / 256).toFixed(1);
        if (numTemp > 200) return (numTemp / 10).toFixed(1);
    }

    const parsed = parseFloat(strTemp);
    return isNaN(parsed) ? (strTemp || '') : parsed.toString();
}

function getDeviceClientCount(dev: any): number {
    // 1. Virtual Parameter
    if (dev.VirtualParameters?.ConnectedDevices?._value !== undefined) return dev.VirtualParameters.ConnectedDevices._value;

    // 2. Direct Counts
    const directCount = dev.InternetGatewayDevice?.ManagementServer?.ManageableDeviceNumberOfEntries?._value ||
        dev.InternetGatewayDevice?.Hosts?.HostNumberOfEntries?._value ||
        dev.Device?.Hosts?.HostNumberOfEntries?._value ||
        dev.InternetGatewayDevice?.LANDevice?.[1]?.Hosts?.HostNumberOfEntries?._value ||
        dev.InternetGatewayDevice?.LANDevice?.[1]?.WLANConfiguration?.[1]?.TotalAssociations?._value;

    if (directCount !== undefined && directCount !== null) return parseInt(directCount);

    // 3. Count object children (Heuristic)
    const hostObj = dev.InternetGatewayDevice?.LANDevice?.[1]?.Hosts?.Host ||
        dev.InternetGatewayDevice?.Hosts?.Host ||
        dev.Device?.Hosts?.Host;

    if (hostObj) {
        // Filter out GenieACS metadata keys
        const keys = Object.keys(hostObj).filter(k => !k.startsWith('_'));
        if (keys.length > 0) return keys.length;
    }

    return 0;
}

/**
 * Extract WAN connections from TR-069 device object
 */
/**
 * Extract WAN connections from TR-069 device object
 */
export function getWanConnections(dev: any): any[] {
    const connections: any[] = [];
    
    // Determine the data model (TR-181 vs TR-098)
    const isTr181 = !!dev.Device;
    const rootPath = isTr181 ? 'Device' : 'InternetGatewayDevice';
    const wanDevice = dev[rootPath]?.WANDevice?.[1];

    if (!wanDevice || !wanDevice.WANConnectionDevice) return [];

    // Iterate through all WANConnectionDevice instances
    Object.keys(wanDevice.WANConnectionDevice).forEach(key => {
        if (key.startsWith('_')) return;
        const wanConnDevice = wanDevice.WANConnectionDevice[key];
        const basePath = `${rootPath}.WANDevice.1.WANConnectionDevice.${key}`;

        // Check PPP Connections
        const pppConns = wanConnDevice.WANPPPConnection || {};
        Object.keys(pppConns).forEach(pKey => {
            if (pKey.startsWith('_')) return;
            const conn = pppConns[pKey];
            connections.push({
                path: `${basePath}.WANPPPConnection.${pKey}`,
                name: conn.Name?._value || `PPP-${key}-${pKey}`,
                type: 'PPPoE',
                status: conn.ConnectionStatus?._value || 'Unknown',
                externalIp: conn.ExternalIPAddress?._value,
                mac: conn.MACAddress?._value,
                username: conn.Username?._value,
                password: conn.Password?._value,
                uptime: conn.Uptime?._value,
                vlanEnable: conn.VLANEnable?._value === true || 
                            conn.VLANEnable?._value === '1' ||
                            conn['X_ZTE-COM_VLANEnable']?._value === 1 ||
                            conn['X_ZTE-COM_VLANEnable']?._value === '1' ||
                            conn.VLANIDMark?._value === true || 
                            conn.VLANIDMark?._value === '1' || 
                            conn['X_ZTE-COM_VLANIDMark']?._value === true ||
                            conn['X_ZTE-COM_VLANIDMark']?._value === '1' ||
                            conn['X_CT-COM_VLANIDMark']?._value === '1' || 
                            (conn.VLANEnable?._value === undefined && !!(conn.VLANID?._value || conn['X_ZTE-COM_VLANID']?._value)),
                vlanId: conn.VLANID?._value || 
                        conn['X_ZTE_COM_VLANID']?._value || 
                        conn['X_ZTE-COM_VLANID']?._value || 
                        conn['X_FH_VLANID']?._value || 
                        conn['X_CT-COM_VLANID']?._value,
                nat: conn.NATEnabled?._value ?? conn.NATEnable?._value ?? true,
                serviceList: conn.ServiceList?._value || 
                            conn['X_CT-COM_ServiceList']?._value || 
                            conn['X_FH_ServiceList']?._value || 
                            conn['X_ZTE-COM_ServiceList']?._value || '',
                mode: conn.ConnectionType?._value?.includes('Bridged') ? 'Bridge' : 'Route',
                bindPorts: (conn['X_CT-COM_BindPort']?._value || conn['X_FH_LanInterface']?._value || conn['X_ZTE-COM_LanInterface']?._value || '').split(',').filter(Boolean),
                isManagement: (key === '1' && pKey === '1') || 
                             (conn.Name?._value || '').toUpperCase().includes('TR069') || 
                             (conn.Name?._value || '').toUpperCase().includes('MGMT') ||
                             (conn.ServiceList?._value || '').toUpperCase().includes('TR069')
            });
        });

        // Check IP Connections
        const ipConns = wanConnDevice.WANIPConnection || {};
        Object.keys(ipConns).forEach(iKey => {
            if (iKey.startsWith('_')) return;
            const conn = ipConns[iKey];
            connections.push({
                path: `${basePath}.WANIPConnection.${iKey}`,
                name: conn.Name?._value || `IP-${key}-${iKey}`,
                type: conn.AddressingType?._value || 'IP',
                status: conn.ConnectionStatus?._value || 'Unknown',
                externalIp: conn.ExternalIPAddress?._value,
                mac: conn.MACAddress?._value,
                uptime: conn.Uptime?._value,
                vlanEnable: conn.VLANEnable?._value === true || 
                            conn.VLANEnable?._value === '1' ||
                            conn['X_ZTE-COM_VLANEnable']?._value === 1 ||
                            conn['X_ZTE-COM_VLANEnable']?._value === '1' ||
                            conn.VLANIDMark?._value === true || 
                            conn.VLANIDMark?._value === '1' || 
                            conn['X_ZTE-COM_VLANIDMark']?._value === true ||
                            conn['X_ZTE-COM_VLANIDMark']?._value === '1' ||
                            conn['X_CT-COM_VLANIDMark']?._value === '1' || 
                            (conn.VLANEnable?._value === undefined && !!(conn.VLANID?._value || conn['X_ZTE-COM_VLANID']?._value)),
                vlanId: conn.VLANID?._value || 
                        conn['X_ZTE_COM_VLANID']?._value || 
                        conn['X_ZTE-COM_VLANID']?._value || 
                        conn['X_FH_VLANID']?._value || 
                        conn['X_CT-COM_VLANID']?._value,
                nat: conn.NATEnabled?._value ?? conn.NATEnable?._value ?? true,
                serviceList: conn.ServiceList?._value || 
                            conn['X_CT-COM_ServiceList']?._value || 
                            conn['X_FH_ServiceList']?._value || 
                            conn['X_ZTE-COM_ServiceList']?._value || 
                            conn['X_HW_ServiceList']?._value || '',
                mode: conn.ConnectionType?._value?.includes('Bridged') ? 'Bridge' : 'Route',
                bindPorts: (conn['X_CT-COM_BindPort']?._value || conn['X_FH_LanInterface']?._value || conn['X_ZTE-COM_LanInterface']?._value || '').split(',').filter(Boolean),
                isManagement: (key === '1' && iKey === '1') || 
                             (conn.Name?._value || '').toUpperCase().includes('TR069') || 
                             (conn.Name?._value || '').toUpperCase().includes('MGMT') ||
                             (conn.ServiceList?._value || '').toUpperCase().includes('TR069')
            });
        });
    });

    return connections;
}
