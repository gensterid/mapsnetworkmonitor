import axios from 'axios';
import { logger } from '../lib/logger.js';
import { settingsService } from './settings.service.js';
import { routerService } from './router.service.js';
import { cacheService } from '../lib/cache.js';
import { encrypt, decrypt } from '../lib/encryption.js';
import { db } from '../db/index.js';
import { onus, olts, devicePerformanceHistory, routerNetwatch } from '../db/schema/index.js';
import { oltService } from './olt.service.js';
import { eq, inArray, and } from 'drizzle-orm';

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

// End of imports

async function getGenieAcsConfig(routerId?: string, tenantId?: string) {
    let url = '';
    let username = '';
    let password = '';
    let isDedicated = false;

    if (routerId) {
        const router = await routerService.findById(routerId, tenantId);
        if (router && router.useGenieAcs) {
            url = router.genieacsUrl || '';
            username = router.genieacsUsername || '';
            password = router.genieacsPasswordEncrypted ? decrypt(router.genieacsPasswordEncrypted) : '';
            if (url) isDedicated = true;
        }
    }

    if (!url && tenantId) {
        const urlSetting = await settingsService.getSetting('genieacs_url', tenantId);
        const userSetting = await settingsService.getSetting('genieacs_username', tenantId);
        const passSetting = await settingsService.getSetting('genieacs_password_encrypted', tenantId);

        url = urlSetting?.value as string || process.env.GENIEACS_URL || 'http://localhost:7557';
        username = userSetting?.value as string || '';
        password = passSetting?.value ? decrypt(passSetting.value as string) : '';
        isDedicated = false;
    }

    return {
        url: url.replace(/\/$/, ''),
        auth: username && password ? { username, password } : undefined,
        isDedicated
    };
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

            const { url, auth, isDedicated } = await getGenieAcsConfig(routerId, tenantId);

            if (!url || url === 'http://localhost:7557') {
                logger.warn({ url }, 'GenieACS: Using default or empty URL. Please check Settings.');
                if (!url) throw new Error('Invalid URL: URL is empty');
            }

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

            const result = response.data.map((dev: any) => ({
                _id: dev._id,
                _registered: dev._registered,
                _lastInform: dev._lastInform,
                _serialNumber: dev._deviceId?._SerialNumber,
                _productClass: (dev._deviceId?._ProductClass || '').replace(/^ONU_|^GPON_|^EPON_/g, ''),
                _manufacturer: (dev._deviceId?._Manufacturer || '').replace(/ Corporation| technology| co\.,ltd| Inc\.| Ltd\./gi, '').trim(),
                _softwareVersion: dev._deviceId?._SoftwareVersion,
                _ip: getDeviceIp(dev),
                _ssid: getDeviceSsid(dev),
                _rxPower: getDeviceRxPower(dev),
                _macAddress: getDeviceMac(dev),
                _isTr181: !!dev.Device,
                _uptime: getDeviceUptime(dev),
                _temperature: getDeviceTemperature(dev),
                _tags: dev._tags || [],
                _clientCount: getDeviceClientCount(dev),
                _vlan: Array.from(new Set(getWanConnections(dev).map(c => String(c.vlanId)).filter(v => v && v !== 'undefined' && v !== 'null'))).join(', '),
                _hardwareVersion: dev.InternetGatewayDevice?.DeviceInfo?.HardwareVersion?._value ||
                    dev.Device?.DeviceInfo?.HardwareVersion?._value || ''
            }));

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
            logger.error({ err: error }, 'GenieACS Sync Error');
            return { added, updated, total };
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

            const { url, auth, isDedicated } = await getGenieAcsConfig(routerId, tenantId);

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
                const device = response.data[0];
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
            const { url, auth } = await getGenieAcsConfig(routerId, tenantId);
            const encodedId = encodeURIComponent(deviceId);

            // Fetch device first to determine TR version
            const device = await genieacsService.getDevice(deviceId, routerId, tenantId);
            if (!device) {
                return { success: false, error: 'Device not found' };
            }

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
            const addParam = (path: string, val: any, type: string = 'xsd:string') => {
                parameters.push([`${connectionPath}.${path}`, val, type]);
            };

            // Detect Manufacturer
            const manufacturer = device._deviceId?._Manufacturer?.toLowerCase() || '';
            const isZte = manufacturer.includes('zte');
            const isHuawei = manufacturer.includes('huawei');

            // Common parameters
            if (config.enable !== undefined) addParam('Enable', config.enable, 'xsd:boolean');

            // VLAN Handling
            if (config.vlanId !== undefined) {
                if (isZte) {
                    addParam('X_ZTE-COM_VLANID', config.vlanId, 'xsd:unsignedInt');
                } else if (isHuawei) {
                    addParam('X_HW_VLAN', config.vlanId, 'xsd:unsignedInt');
                } else {
                    addParam('X_CT-COM_VLANID', config.vlanId, 'xsd:unsignedInt');
                }
            }

            // Port Binding Handling
            if (config.bindPorts) {
                if (isZte) {
                    addParam('X_ZTE-COM_BindPort', config.bindPorts);
                } else if (isHuawei) {
                    addParam('X_HW_LANBinding', config.bindPorts);
                } else {
                    addParam('X_CT-COM_BindPort', config.bindPorts);
                }
            }

            if (config.wanType === 'pppoe') {
                if (config.username) addParam('Username', config.username);
                if (config.password) addParam('Password', config.password);

                // Handle Connection Mode (Route vs Bridge)
                const isBridge = config.connectionMode === 'bridge';
                const connectionType = isBridge ? 'PPPoE_Bridged' : 'IP_Routed';

                addParam('ConnectionType', connectionType);
                addParam('NATEnabled', !isBridge, 'xsd:boolean');

                if (isZte) {
                    addParam('X_ZTE-COM_ServiceList', 'INTERNET');
                }
            } else {
                // IP Connection
                const isBridge = config.connectionMode === 'bridge';
                const connectionType = isBridge ? 'IP_Bridged' : 'IP_Routed';
                addParam('ConnectionType', connectionType);
                addParam('NATEnabled', !isBridge, 'xsd:boolean');

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

            logger.info({ deviceId, path: connectionPath, parameters }, 'GenieACS: Sending setParameterValues');

            const response = await axios.post(`${url}/devices/${encodedId}/tasks?timeout=3000&connection_request`, {
                name: 'setParameterValues',
                parameterValues: parameters
            }, {
                auth
            });

            logger.info({ status: response.status }, 'GenieACS: Task response');

            // Invalidate cache
            cacheService.delete(`genieacs:device:${deviceId}`);
            cacheService.invalidatePrefix('genieacs:devices');

            // Proactively refresh the object to see changes immediately
            if (response.status < 300) {
                axios.post(`${url}/devices/${encodedId}/tasks?connection_request`, {
                    name: 'refreshObject',
                    objectName: connectionPath
                }, { auth }).catch(() => { });
            }

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
    updateWifiConfig: async (deviceId: string, config: WifiConfigPayload, routerId?: string, tenantId?: string) => {
        try {
            const { url, auth } = await getGenieAcsConfig(routerId, tenantId);
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
            const addParam = (path: string, val: any, type: string = 'xsd:string') => {
                parameters.push([`${basePath}.${path}`, val, type]);
            };

            // 1. Common Parameters
            if (config.enable !== undefined) addParam('Enable', config.enable, 'xsd:boolean');
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
                    addParam('SSIDAdvertisementEnabled', !config.hidden, 'xsd:boolean');
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

            // Invalidate cache
            cacheService.delete(`genieacs:device:${deviceId}`);
            cacheService.invalidatePrefix('genieacs:devices');

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
    rebootDevice: async (deviceId: string, routerId?: string, tenantId?: string) => {
        try {
            const { url, auth } = await getGenieAcsConfig(routerId, tenantId);
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
            const { url, auth } = await getGenieAcsConfig(routerId, tenantId);
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
     * Refresh Device (Summon)
     */
    refreshDevice: async (deviceId: string, routerId?: string, tenantId?: string) => {
        try {
            const { url, auth } = await getGenieAcsConfig(routerId, tenantId);
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
                const { url, auth } = await getGenieAcsConfig(routerId, tenantId);
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
            const { url, auth } = await getGenieAcsConfig(routerId, tenantId);
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
            const { url, auth } = await getGenieAcsConfig(routerId);
            if (!url) throw new Error('URL is not configured');

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
};

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

    // 3. Fallbacks
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
export function getWanConnections(dev: any): any[] {
    const connections: any[] = [];
    const wanDevice = dev.InternetGatewayDevice?.WANDevice?.[1] || dev.Device?.WANDevice?.[1];

    if (!wanDevice || !wanDevice.WANConnectionDevice) return [];

    // Iterate through all WANConnectionDevice instances
    Object.keys(wanDevice.WANConnectionDevice).forEach(key => {
        if (key.startsWith('_')) return;
        const wanConnDevice = wanDevice.WANConnectionDevice[key];

        // Check PPP Connections
        const pppConns = wanConnDevice.WANPPPConnection || {};
        Object.keys(pppConns).forEach(pKey => {
            if (pKey.startsWith('_')) return;
            const conn = pppConns[pKey];
            connections.push({
                name: conn.Name?._value || `PPP-${key}-${pKey}`,
                type: 'PPPoE',
                status: conn.ConnectionStatus?._value || 'Unknown',
                externalIp: conn.ExternalIPAddress?._value,
                mac: conn.MACAddress?._value,
                username: conn.Username?._value,
                uptime: conn.Uptime?._value,
                vlanId: conn['X_ZTE-COM_VLANID']?._value || conn.X_ZTE_COM_VLANID?._value || conn.VLANID?._value
            });
        });

        // Check IP Connections
        const ipConns = wanConnDevice.WANIPConnection || {};
        Object.keys(ipConns).forEach(iKey => {
            if (iKey.startsWith('_')) return;
            const conn = ipConns[iKey];
            connections.push({
                name: conn.Name?._value || `IP-${key}-${iKey}`,
                type: conn.AddressingType?._value || 'IP',
                status: conn.ConnectionStatus?._value || 'Unknown',
                externalIp: conn.ExternalIPAddress?._value,
                mac: conn.MACAddress?._value,
                uptime: conn.Uptime?._value,
                vlanId: conn['X_ZTE-COM_VLANID']?._value || conn.X_ZTE_COM_VLANID?._value || conn.VLANID?._value
            });
        });
    });

    return connections;
}
