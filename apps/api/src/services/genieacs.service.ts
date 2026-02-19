import axios from 'axios';
import { logger } from '../lib/logger.js';
import { settingsService } from './settings.service.js';
import { routerService } from './router.service.js';

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
    _softwareVersion?: string;
    _rxPower?: string;
    _macAddress?: string;
    _isTr181?: boolean;
    InternetGatewayDevice?: any;
    Device?: any;
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
}

export interface WifiConfigPayload {
    ssidIndex: number; // 1-4
    enable?: boolean;
    ssid?: string;
    password?: string;
    securityMode?: 'Open' | 'WPA2-PSK' | 'WPA-WPA2-Mixed';
    encryption?: 'AES' | 'TKIP+AES';
    hidden?: boolean;
    channel?: number | 'Auto';
}

import { encrypt, decrypt } from '../lib/encryption.js';
import { db } from '../db/index.js';
import { onus } from '../db/schema/index.js';
import { eq } from 'drizzle-orm';

async function getGenieAcsConfig(routerId?: string) {
    let url = '';
    let username = '';
    let password = '';

    if (routerId) {
        const router = await routerService.findById(routerId);
        if (router && router.useGenieAcs) {
            url = router.genieacsUrl || '';
            username = router.genieacsUsername || '';
            password = router.genieacsPasswordEncrypted ? decrypt(router.genieacsPasswordEncrypted) : '';
        }
    }

    if (!url) {
        const urlSetting = await settingsService.getSetting('genieacs_url') as any;
        const userSetting = await settingsService.getSetting('genieacs_username') as any;
        const passSetting = await settingsService.getSetting('genieacs_password_encrypted') as any;


        url = urlSetting?.value || process.env.GENIEACS_URL || 'http://localhost:7557';
        username = userSetting?.value || '';
        password = passSetting?.value ? decrypt(passSetting.value) : '';
    }

    return {
        url: url.replace(/\/$/, ''),
        auth: username && password ? { username, password } : undefined
    };
}

export const genieacsService = {
    /**
     * Get all devices from GenieACS
     * Supports MongoDB-style query
     */
    getDevices: async (routerId?: string, query: any = {}): Promise<GenieACSDevice[]> => {
        try {
            const { url, auth } = await getGenieAcsConfig(routerId);

            if (!url || url === 'http://localhost:7557') {
                logger.warn({ url }, 'GenieACS: Using default or empty URL. Please check Settings.');
                if (!url) throw new Error('Invalid URL: URL is empty');
            }

            // Debug: Log URL to verify Proxmox connectivity
            logger.info({ url }, 'GenieACS: Fetching devices');

            const projection = {
                _id: 1,
                _registered: 1,
                _lastInform: 1,
                '_deviceId._SerialNumber': 1,
                '_deviceId._ProductClass': 1,
                '_deviceId._OUI': 1,
                '_deviceId._Manufacturer': 1,
                '_deviceId._SoftwareVersion': 1,
                'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANIPConnection.1.ExternalIPAddress': 1,
                'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.ExternalIPAddress': 1,
                'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.SSID': 1,
                'Device.WiFi.SSID.1.SSID': 1,
                // ZTE Optical Power
                'InternetGatewayDevice.WANDevice.1.X_ZTE-COM_WANDevice.1.OpticalModuleInfo.RXPower': 1,
                'InternetGatewayDevice.WANDevice.1.X_ZTE-COM_WANDevice.1.OpticalInstance.1.OpticalSignalLevel': 1,
                'InternetGatewayDevice.WANDevice.1.X_ZTE-COM_WANPONInterfaceConfig.RXPower': 1,
                'InternetGatewayDevice.WANDevice.1.X_ZTE_COM_WANPONInterfaceConfig.RXPower': 1,
                'InternetGatewayDevice.WANDevice.1.One_Optical_Module_Info.RXPower': 1,
                // ZTE ONU Path (Alternative)
                'InternetGatewayDevice.WANDevice.1.X_ZTE-COM_ONU.1.OpticalModuleInfo.RXPower': 1,
                'InternetGatewayDevice.WANDevice.1.X_ZTE_COM_ONU.1.OpticalModuleInfo.RXPower': 1,
                'InternetGatewayDevice.WANDevice.1.X_ZTE-COM_WANDevice.1.X_ZTE-COM_Optical.1.RxPower': 1,
                'InternetGatewayDevice.WANDevice.1.X_ZTE_COM_WANDevice.1.X_ZTE_COM_Optical.1.RxPower': 1,
                // Huawei Optical Power
                'InternetGatewayDevice.WANDevice.1.X_HUWEI_WANDevice.1.OpticalModuleInfo.RXPower': 1,
                'InternetGatewayDevice.WANDevice.1.WANDSLInterfaceConfig.DownstreamAttenuation': 1,
                // FiberHome Optical Power
                'InternetGatewayDevice.WANDevice.1.X_FH_GponInterfaceConfig.RXPower': 1,
                // Virtual Parameters (Custom GenieACS scripts)
                'VirtualParameters.RXPower': 1,
                'VirtualParameters.IPTR069': 1,
                '_mac': 1,
                'InternetGatewayDevice.LANDevice.1.LANEthernetInterfaceConfig.1.MACAddress': 1,
                'Device.Ethernet.Interface.1.MACAddress': 1,
            };

            const response = await axios.get(`${url}/devices`, {
                params: {
                    query: JSON.stringify(query),
                    projection: Object.keys(projection).join(',')
                },
                auth,
                timeout: 10000 // Increased timeout for Proxmox
            });

            logger.info({ count: response.data?.length || 0 }, 'GenieACS: Successfully fetched devices');

            return response.data.map((dev: any) => ({
                _id: dev._id,
                _registered: dev._registered,
                _lastInform: dev._lastInform,
                _serialNumber: dev._deviceId?._SerialNumber,
                _productClass: dev._deviceId?._ProductClass,
                _manufacturer: dev._deviceId?._Manufacturer,
                _softwareVersion: dev._deviceId?._SoftwareVersion,
                _ip: getDeviceIp(dev),
                _ssid: getDeviceSsid(dev),
                _rxPower: getDeviceRxPower(dev),
                _macAddress: getDeviceMac(dev),
                _isTr181: !!dev.Device
            }));
        } catch (error) {
            const errMsg = error instanceof Error ? error.message : String(error);
            logger.error({ err: errMsg }, 'GenieACS: Failed to fetch devices');
            return [];
        }
    },

    /**
     * UNIFIED LINKAGE: Sync GenieACS metadata to ONUS table
     */
    syncMetadata: async (routerId?: string) => {
        let added = 0;
        let updated = 0;
        let total = 0;

        try {
            logger.info('GenieACS: Starting metadata sync');
            const devices = await genieacsService.getDevices(routerId);
            total = devices.length;

            for (const dev of devices) {
                if (!dev._serialNumber) continue;

                const sn = dev._serialNumber;

                // Check if exists
                const [existing] = await db.select().from(onus).where(eq(onus.sn, sn));

                if (existing) {
                    // Update
                    const sources = (existing.discoverySources as string[]) || [];
                    if (!sources.includes('acs')) sources.push('acs');

                    await db.update(onus).set({
                        model: dev._productClass || existing.model,
                        ssid: dev._ssid || existing.ssid,
                        firmwareVersion: dev._softwareVersion || existing.firmwareVersion,
                        host: dev._ip || existing.host,
                        lastRxPower: dev._rxPower || existing.lastRxPower,
                        macAddress: dev._macAddress || existing.macAddress,
                        discoverySources: sources,
                        updatedAt: new Date(),
                        lastSeen: dev._lastInform ? new Date(dev._lastInform) : existing.lastSeen
                    }).where(eq(onus.id, existing.id));
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

                    await db.insert(onus).values({
                        sn: sn,
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
                    });
                    added++;
                }
            }
            logger.info({ total, added, updated }, 'GenieACS: Metadata sync completed');
            return { added, updated, total };

        } catch (error) {
            logger.error({ err: error }, 'GenieACS Sync Error');
            return { added, updated, total };
        }
    },

    /**
     * Get single device details
     */
    getDevice: async (deviceId: string, routerId?: string) => {
        try {
            const { url, auth } = await getGenieAcsConfig(routerId);

            // Use query to avoid 405 Method Not Allowed on some GenieACS versions
            const query = { _id: deviceId };
            const response = await axios.get(`${url}/devices`, {
                params: {
                    query: JSON.stringify(query)
                },
                auth,
                timeout: 5000
            });

            if (response.data && response.data.length > 0) {
                return response.data[0];
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
    updateWanConfig: async (deviceId: string, config: WanConfigPayload, routerId?: string) => {
        try {
            const { url, auth } = await getGenieAcsConfig(routerId);
            const encodedId = encodeURIComponent(deviceId);

            // Fetch device first to determine TR version
            // We use the existing getDevice method which uses query to avoid 405
            // Helper to find the correct WAN path
            function findWanPath(device: any, wanType: 'pppoe' | 'ip'): string | null {
                try {
                    logger.info({ wanType }, 'GenieACS WAN-Discovery: Starting discovery');

                    // Handle TR-181 (Device.IP.Interface...)
                    if (device.Device?.IP?.Interface) {
                        logger.info('GenieACS WAN-Discovery: TR-181 detected (partial support)');
                        // TODO: Implement thorough TR-181 logic. 
                        // For now, check if alias IGD exists or fallback to TR-098 logic which often works on hybrid devices
                        // If explicit TR-181 structure is found, we might need to look for Interface with Type='WAN'
                    }

                    const wanDevices = device.InternetGatewayDevice?.WANDevice;
                    if (!wanDevices) {
                        logger.info('GenieACS WAN-Discovery: No InternetGatewayDevice.WANDevice found');
                        return null;
                    }

                    // Iterate WANDevice (usually index 1, but maybe others)
                    for (const wdKey in wanDevices) {
                        if (wdKey === '_object' || wdKey === '_timestamp' || wdKey === '_writable') continue;

                        const wanConnDevices = wanDevices[wdKey]?.WANConnectionDevice;
                        if (!wanConnDevices) continue;

                        logger.debug({ wdKey }, 'GenieACS WAN-Discovery: Checking WANDevice');

                        // Iterate WANConnectionDevice
                        for (const wcdKey in wanConnDevices) {
                            if (wcdKey === '_object' || wcdKey === '_timestamp' || wcdKey === '_writable') continue;

                            const connectionDevice = wanConnDevices[wcdKey];
                            const basePath = `InternetGatewayDevice.WANDevice.${wdKey}.WANConnectionDevice.${wcdKey}`;

                            logger.debug({ wcdKey }, 'GenieACS WAN-Discovery: Checking WANConnectionDevice');

                            // Check for WANPPPConnection
                            if (wanType === 'pppoe' && connectionDevice.WANPPPConnection) {
                                for (const pppKey in connectionDevice.WANPPPConnection) {
                                    if (pppKey.startsWith('_')) continue;
                                    const pppConn = connectionDevice.WANPPPConnection[pppKey];

                                    // Heuristics to find "INTERNET" connection
                                    const name = pppConn.Name?._value || '';
                                    const serviceList = pppConn.X_CT_COM_ServiceList?._value || pppConn['X_ZTE-COM_ServiceList']?._value || ''; // ZTE support
                                    const connectionType = pppConn.ConnectionType?._value || '';

                                    logger.info({
                                        path: `${basePath}.WANPPPConnection.${pppKey}`,
                                        name
                                    }, 'GenieACS WAN-Discovery: Found PPPoE candidate');

                                    // Priority 1: Explicit "INTERNET" service
                                    if (serviceList.toUpperCase().includes('INTERNET') || name.toUpperCase().includes('INTERNET')) {
                                        return `${basePath}.WANPPPConnection.${pppKey}`;
                                    }

                                    // Priority 2: IP_Routed connection
                                    if (connectionType === 'IP_Routed') {
                                        return `${basePath}.WANPPPConnection.${pppKey}`;
                                    }
                                }
                                // If we found a container but no "perfect" match, stick with index 1 if it exists
                                if (connectionDevice.WANPPPConnection['1']) {
                                    return `${basePath}.WANPPPConnection.1`;
                                }
                            }

                            // Check for WANIPConnection
                            if (wanType === 'ip' && connectionDevice.WANIPConnection) {
                                for (const ipKey in connectionDevice.WANIPConnection) {
                                    if (ipKey.startsWith('_')) continue;
                                    const ipConn = connectionDevice.WANIPConnection[ipKey];

                                    const name = ipConn.Name?._value || '';
                                    const serviceList = ipConn.X_CT_COM_ServiceList?._value || ipConn['X_ZTE-COM_ServiceList']?._value || '';

                                    logger.info({
                                        path: `${basePath}.WANIPConnection.${ipKey}`,
                                        name
                                    }, 'GenieACS WAN-Discovery: Found IP candidate');

                                    if (serviceList.toUpperCase().includes('INTERNET') || name.toUpperCase().includes('INTERNET')) {
                                        return `${basePath}.WANIPConnection.${ipKey}`;
                                    }
                                }
                                if (connectionDevice.WANIPConnection['1']) {
                                    return `${basePath}.WANIPConnection.1`;
                                }
                            }
                        }
                    }

                    logger.info('GenieACS WAN-Discovery: No specific match found, falling back');
                    return null;
                } catch (e) {
                    logger.error({ err: e }, 'GenieACS WAN-Discovery logic error');
                    return null;
                }
            }

            const device = await genieacsService.getDevice(deviceId, routerId);
            if (!device) {
                return { success: false, error: 'Device not found' };
            }

            const isTr181 = !!device.Device;
            const connectionIndex = config.connectionIndex || 1;

            // Try auto-discovery
            let connectionPath = findWanPath(device, config.wanType);

            if (!connectionPath) {
                // Fallback to strict index 1 if discovery fails
                logger.info({ connectionIndex }, 'GenieACS WAN-Discovery: Auto-discovery failed, using fallback');
                const basePath = `InternetGatewayDevice.WANDevice.1.WANConnectionDevice.${connectionIndex}`;
                connectionPath = config.wanType === 'pppoe'
                    ? `${basePath}.WANPPPConnection.1`
                    : `${basePath}.WANIPConnection.1`;
            }

            logger.info({ path: connectionPath }, 'GenieACS WAN-Discovery: Selected path');

            const parameters: [string, any, string?][] = [];

            // Helper to add param
            const addParam = (path: string, val: any) => {
                parameters.push([`${connectionPath}.${path}`, val, 'xsd:string']);
            };

            // Detect Manufacturer
            const manufacturer = device._deviceId?._Manufacturer?.toLowerCase() || '';
            const isZte = manufacturer.includes('zte');
            const isHuawei = manufacturer.includes('huawei');

            // Common parameters
            // Check if 'Enable' exists in the path or just set it blindly?
            // Safer to set it as boolean true
            if (config.enable !== undefined) addParam('Enable', config.enable);

            // VLAN Handling
            if (config.vlanId !== undefined) {
                if (isZte) {
                    addParam('X_ZTE-COM_VLANID', config.vlanId);
                } else if (isHuawei) {
                    addParam('X_HW_VLAN', config.vlanId); // Try Huawei specific
                } else {
                    addParam('X_CT-COM_VLANID', config.vlanId); // Default fallback
                }
            }

            if (config.wanType === 'pppoe') {
                if (config.username) addParam('Username', config.username);
                if (config.password) addParam('Password', config.password);

                // Handle Connection Mode (Route vs Bridge)
                const isBridge = config.connectionMode === 'bridge';
                const connectionType = isBridge ? 'PPPoE_Bridged' : 'IP_Routed';

                addParam('ConnectionType', connectionType);
                addParam('NATEnabled', !isBridge);

                if (isZte) {
                    addParam('X_ZTE-COM_ServiceList', 'INTERNET');
                }
            } else {
                // IP Connection
                const isBridge = config.connectionMode === 'bridge';
                const connectionType = isBridge ? 'IP_Bridged' : 'IP_Routed';
                addParam('ConnectionType', connectionType);
                addParam('NATEnabled', !isBridge);

                if (config.addressingType) addParam('AddressingType', config.addressingType);
                if (config.addressingType === 'Static') {
                    if (config.ipAddress) addParam('ExternalIPAddress', config.ipAddress);
                    if (config.subnetMask) addParam('SubnetMask', config.subnetMask);
                    if (config.defaultGateway) addParam('DefaultGateway', config.defaultGateway);
                    if (config.dnsServers) addParam('DNSServers', config.dnsServers);
                }
            }

            if (parameters.length === 0) {
                return { success: false, error: 'No parameters to update' };
            }

            logger.info({ deviceId, path: connectionPath }, 'GenieACS: Updating WAN config');

            const response = await axios.post(`${url}/devices/${encodedId}/tasks?timeout=3000&connection_request`, {
                name: 'setParameterValues',
                parameterValues: parameters
            }, {
                auth
            });

            logger.info({ status: response.status }, 'GenieACS: Task response');

            return { success: true, taskId: response.data?._id };
        } catch (error) {
            if (axios.isAxiosError(error)) {
                console.error(`GenieACS updateWanConfig Error: ${error.response?.status} - ${JSON.stringify(error.response?.data)}`);
            } else {
                console.error(`GenieACS updateWanConfig Error:`, error instanceof Error ? error.message : error);
            }
            return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
        }
    },

    /**
     * Update WiFi Configuration
     */
    updateWifiConfig: async (deviceId: string, config: WifiConfigPayload, routerId?: string) => {
        try {
            const { url, auth } = await getGenieAcsConfig(routerId);
            const encodedId = encodeURIComponent(deviceId);

            // Fetch device first to determine TR version / Manufacturer
            const device = await genieacsService.getDevice(deviceId, routerId);
            if (!device) {
                return { success: false, error: 'Device not found' };
            }

            // Determine Manufacturer
            const manufacturer = device._deviceId?._Manufacturer?.toLowerCase() || '';
            const isZte = manufacturer.includes('zte');
            const isHuawei = manufacturer.includes('huawei');

            // Paths
            // TR-098: InternetGatewayDevice.LANDevice.1.WLANConfiguration.{i}
            // TR-181: Device.WiFi.SSID.{i} (and Device.WiFi.AccessPoint.{i}.Security)

            const index = config.ssidIndex || 1;
            let basePath = '';

            const isTr181 = !!device.Device;

            if (isTr181) {
                basePath = `Device.WiFi.SSID.${index}`;
            } else {
                basePath = `InternetGatewayDevice.LANDevice.1.WLANConfiguration.${index}`;
            }

            logger.info({ path: basePath }, 'GenieACS WiFi-Config: Target path');

            const parameters: [string, any, string?][] = [];
            const addParam = (path: string, val: any) => {
                parameters.push([`${basePath}.${path}`, val, 'xsd:string']);
            };

            // 1. Common Parameters
            if (config.enable !== undefined) addParam('Enable', config.enable);
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
                if (config.securityMode) {
                    // Map UI modes to TR-069
                    if (config.securityMode === 'Open') {
                        addParam('BeaconType', 'None');
                        addParam('BasicAuthenticationMode', 'None');
                    } else if (config.securityMode === 'WPA2-PSK') {
                        addParam('BeaconType', 'WPAand11i'); // Or 11i
                        addParam('BasicAuthenticationMode', 'None');
                        addParam('WPAAuthenticationMode', 'PSKAuthentication');
                        addParam('IEEE11iAuthenticationMode', 'PSKAuthentication');
                    } else if (config.securityMode === 'WPA-WPA2-Mixed') {
                        addParam('BeaconType', 'WPAand11i');
                        addParam('BasicAuthenticationMode', 'None');
                    }
                }

                if (config.encryption) {
                    if (config.encryption === 'AES') {
                        addParam('WPAEncryptionModes', 'AESEncryption');
                        addParam('IEEE11iEncryptionModes', 'AESEncryption');
                    } else if (config.encryption === 'TKIP+AES') {
                        addParam('WPAEncryptionModes', 'TKIPandAESEncryption');
                        addParam('IEEE11iEncryptionModes', 'TKIPandAESEncryption');
                    }
                }

                // Hidden SSID
                if (config.hidden !== undefined) {
                    // SSIDAdvertisementEnabled: true = broadcast (visible), false = hidden
                    addParam('SSIDAdvertisementEnabled', !config.hidden);
                }

                // Channel
                if (config.channel) {
                    if (config.channel === 'Auto') {
                        addParam('AutoChannelEnable', true);
                    } else {
                        addParam('AutoChannelEnable', false);
                        addParam('Channel', config.channel);
                    }
                }
            } else {
                // TR-181 logic (Security in AccessPoint)
                if (config.securityMode) {
                    const apSecurity = `Device.WiFi.AccessPoint.${index}.Security`;
                    // Implementation varies heavily for TR-181
                    // Placeholder for now
                }
            }

            if (parameters.length === 0) {
                return { success: false, error: 'No parameters to update' };
            }

            logger.info({ deviceId }, 'GenieACS: Updating WiFi config');

            const response = await axios.post(`${url}/devices/${encodedId}/tasks?timeout=3000&connection_request`, {
                name: 'setParameterValues',
                parameterValues: parameters
            }, {
                auth
            });

            return { success: true, taskId: response.data?._id };

        } catch (error) {
            logger.error({ deviceId, err: error }, 'GenieACS updateWifiConfig Error');
            return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
        }
    },

    /**
     * Reboot device
     */
    rebootDevice: async (deviceId: string, routerId?: string) => {
        try {
            const { url, auth } = await getGenieAcsConfig(routerId);
            const encodedId = encodeURIComponent(deviceId);
            await axios.post(`${url}/devices/${encodedId}/tasks?timeout=3000&connection_request`, {
                name: 'reboot'
            }, {
                auth
            });
            return { success: true };
        } catch (error) {
            return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
        }
    },

    /**
     * Update device parameters (TR-069 setParameterValues)
     */
    setParameter: async (deviceId: string, parameterName: string, value: any, type: string = 'xsd:string', routerId?: string) => {
        try {
            const { url, auth } = await getGenieAcsConfig(routerId);
            const encodedId = encodeURIComponent(deviceId);
            await axios.post(`${url}/devices/${encodedId}/tasks?timeout=3000&connection_request`, {
                name: 'setParameterValues',
                parameterValues: [[parameterName, value, type]]
            }, {
                auth
            });
            return { success: true };
        } catch (error) {
            logger.error({ deviceId, parameterName, err: error }, 'GenieACS setParameter Error');
            return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
        }
    },

    /**
     * Refresh Device (Summon)
     */
    refreshDevice: async (deviceId: string, routerId?: string) => {
        try {
            const { url, auth } = await getGenieAcsConfig(routerId);
            const encodedId = encodeURIComponent(deviceId);

            // Parameters to refresh (Optical Power & Status)
            const parameterNames = [
                'InternetGatewayDevice.WANDevice.1.X_ZTE-COM_WANDevice.1.OpticalModuleInfo.RXPower',
                'InternetGatewayDevice.WANDevice.1.X_ZTE-COM_WANDevice.1.OpticalInstance.1.OpticalSignalLevel',
                'InternetGatewayDevice.WANDevice.1.One_Optical_Module_Info.RXPower',
                'InternetGatewayDevice.WANDevice.1.X_ZTE-COM_ONU.1.OpticalModuleInfo.RXPower',
                'InternetGatewayDevice.WANDevice.1.X_ZTE-COM_WANDevice.1.X_ZTE-COM_Optical.1.RxPower',
                'InternetGatewayDevice.WANDevice.1.X_HUWEI_WANDevice.1.OpticalModuleInfo.RXPower',
                'InternetGatewayDevice.WANDevice.1.WANDSLInterfaceConfig.DownstreamAttenuation'
            ];

            await axios.post(`${url}/devices/${encodedId}/tasks?timeout=3000&connection_request`, {
                name: 'getParameterValues',
                parameterNames: parameterNames
            }, {
                auth
            });

            return { success: true };
        } catch (error) {
            logger.error({ deviceId, err: error }, 'GenieACS refreshDevice Error');
            // Fallback to simple refreshObject if getParameterValues fails (e.g., too many params)
            try {
                const { url, auth } = await getGenieAcsConfig(routerId);
                const encodedId = encodeURIComponent(deviceId);
                await axios.post(`${url}/devices/${encodedId}/tasks?timeout=3000&connection_request`, {
                    name: 'refreshObject',
                    objectName: ''
                }, { auth });
                return { success: true };
            } catch (retryError) {
                return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
            }
        }
    },

    /**
     * Factory Reset
     */
    factoryReset: async (deviceId: string, routerId?: string) => {
        try {
            const { url, auth } = await getGenieAcsConfig(routerId);
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
    bulkReboot: async (deviceIds: string[], routerId?: string) => {
        const results = { success: 0, failed: 0, errors: [] as string[] };

        await Promise.all(deviceIds.map(async (id) => {
            const res = await genieacsService.rebootDevice(id, routerId);
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
    bulkPushConfig: async (deviceIds: string[], type: 'wan' | 'wifi', config: any, routerId?: string) => {
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
    }
};

// Helper to extract IP from common paths
function getDeviceIp(dev: any): string {
    return dev.VirtualParameters?.IPTR069?._value ||
        dev.InternetGatewayDevice?.WANDevice?.[1]?.WANConnectionDevice?.[1]?.WANPPPConnection?.[1]?.ExternalIPAddress?._value ||
        dev.InternetGatewayDevice?.WANDevice?.[1]?.WANConnectionDevice?.[1]?.WANIPConnection?.[1]?.ExternalIPAddress?._value ||
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
    if (!strVal.includes('.') && strVal.length > 2 && !isNaN(Number(strVal))) {
        // If it looks like raw integer (e.g., -2318 or 2318), format it? 
        // But some return actual dBm already. For now return as is or if it's very large, treat as 0.01 units
        const num = Number(strVal);
        if (num < -500 || num > 500) return (num / 100).toFixed(2);
    }

    return strVal;
}

function getDeviceMac(dev: any): string {
    return dev._mac ||
        dev.InternetGatewayDevice?.LANDevice?.[1]?.LANEthernetInterfaceConfig?.[1]?.MACAddress?._value ||
        dev.Device?.Ethernet?.Interface?.[1]?.MACAddress?._value ||
        '';
}
