import axios from 'axios';
import { logger } from '../../lib/logger.js';
import { db } from '../../db/index.js';
import { onus, olts, devicePerformanceHistory, routerNetwatch } from '../../db/schema/index.js';
import { eq, and, or, sql } from 'drizzle-orm';
import { cacheService } from '../../lib/cache.js';
import { oltService } from '../olt.service.js';
import { settingsService } from '../settings.service.js';
import { GenieACSDevice, getGenieAcsConfig } from './genieacs-core.service.js';

/**
 * Get all devices from GenieACS
 */
export async function getDevices(routerId?: string, tenantId?: string, query: any = {}, force = false, projectionMode: 'full' | 'stats' = 'full'): Promise<GenieACSDevice[]> {
    const cacheKey = `genieacs:devices:${tenantId || 'all'}:${routerId || 'all'}:${JSON.stringify(query)}:${projectionMode}`;
    if (!force) {
        const cached = await cacheService.get<GenieACSDevice[]>(cacheKey);
        if (cached) return cached;
    }

    try {
        const config = await getGenieAcsConfig(routerId, tenantId);
        if (!config) return [];
        const { url, auth, isDedicated } = config;

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
                return [];
            }
        }

        const projection: Record<string, any> = {
            _id: 1, _registered: 1, _lastInform: 1,
            '_deviceId._SerialNumber': 1, '_deviceId._ProductClass': 1, '_deviceId._OUI': 1, '_deviceId._Manufacturer': 1, '_deviceId._SoftwareVersion': 1,
            _tags: 1, _mac: 1,
            'InternetGatewayDevice.ManagementServer.ConnectionRequestURL': 1, 'Device.ManagementServer.ConnectionRequestURL': 1,
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
            'VirtualParameters.RXPower': 1, 'VirtualParameters.IPTR069': 1,
            'InternetGatewayDevice.DeviceInfo.Temperature': 1, 'Device.DeviceInfo.Temperature': 1,
            'VirtualParameters.Temperature': 1, 'VirtualParameters.gettemp': 1,
            'VirtualParameters.PonMac': 1, 'VirtualParameters.pppoeMac': 1, 'VirtualParameters.MACAddress': 1,
            'InternetGatewayDevice.DeviceInfo.UpTime': 1, 'Device.DeviceInfo.UpTime': 1,
            'VirtualParameters.ConnectedDevices': 1
        };

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
            params: { query: JSON.stringify(query), projection: Object.keys(projection).join(',') },
            auth, timeout: 10000
        });

        const result = response.data.map((dev: any) => transformGenieACSDevice(dev));
        await cacheService.set(cacheKey, result, cacheService.TTL.GENIEACS_DEVICES);
        return result;
    } catch (error: any) {
        // Log the error for internal diagnostics
        logger.error({ 
            err: error?.message || String(error),
            code: error?.code,
            routerId, 
            tenantId 
        }, 'GenieACS: Failed to fetch devices');
        
        // Re-throw the error so the controller can handle HTTP status codes (503/504)
        throw error;
    }
}

/**
 * Unified Device Transformer
 */
export function transformGenieACSDevice(dev: any) {
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
        ...dev
    };
}

// Helpers for transformers
function getDeviceIp(dev: any): string {
    if (dev._ip) return dev._ip;
    const url = dev.InternetGatewayDevice?.ManagementServer?.ConnectionRequestURL?._value || dev.Device?.ManagementServer?.ConnectionRequestURL?._value;
    if (url && typeof url === 'string') {
        const match = url.match(/:\/\/(?:[a-zA-Z0-9-._~%]+@)?([0-9a-zA-Z.-]+)(?::[0-9]+)?/);
        if (match && match[1]) return match[1];
    }
    return dev.VirtualParameters?.IPTR069?._value ||
        dev.InternetGatewayDevice?.WANDevice?.[1]?.WANConnectionDevice?.[1]?.WANIPConnection?.[1]?.ExternalIPAddress?._value ||
        dev.InternetGatewayDevice?.WANDevice?.[1]?.WANConnectionDevice?.[2]?.WANPPPConnection?.[1]?.ExternalIPAddress?._value ||
        dev.InternetGatewayDevice?.WANDevice?.[1]?.WANConnectionDevice?.[1]?.WANPPPConnection?.[1]?.ExternalIPAddress?._value || '';
}

function getDeviceSsid(dev: any): string {
    return dev.InternetGatewayDevice?.LANDevice?.[1]?.WLANConfiguration?.[1]?.SSID?._value || dev.Device?.WiFi?.SSID?.[1]?.SSID?._value || '';
}

function getDeviceRxPower(dev: any): string {
    if (dev.VirtualParameters?.RXPower?._value) return dev.VirtualParameters.RXPower._value;
    const rawValue = dev.InternetGatewayDevice?.WANDevice?.[1]?.['X_ZTE-COM_WANDevice']?.[1]?.OpticalModuleInfo?.RXPower?._value ||
        dev.InternetGatewayDevice?.WANDevice?.[1]?.['X_ZTE_COM_WANDevice']?.[1]?.OpticalModuleInfo?.RXPower?._value ||
        dev.InternetGatewayDevice?.WANDevice?.[1]?.['X_ZTE-COM_WANPONInterfaceConfig']?.RXPower?._value ||
        dev.InternetGatewayDevice?.WANDevice?.[1]?.One_Optical_Module_Info?.RXPower?._value ||
        dev.InternetGatewayDevice?.WANDevice?.[1]?.['X_HUWEI_WANDevice']?.[1]?.OpticalModuleInfo?.RXPower?._value ||
        dev.InternetGatewayDevice?.WANDevice?.[1]?.['X_FH_GponInterfaceConfig']?.RXPower?._value;
    if (!rawValue) return '';
    const num = Number(rawValue);
    if (!String(rawValue).includes('.') && !isNaN(num)) {
        if (Math.abs(num) > 500) return (num / 100).toFixed(2);
        if (Math.abs(num) > 50) return (num / 10).toFixed(1);
    }
    return String(rawValue);
}

function getDeviceMac(dev: any): string {
    return dev.VirtualParameters?.PonMac?._value || dev.VirtualParameters?.pppoeMac?._value || dev._mac || 
        dev.InternetGatewayDevice?.LANDevice?.[1]?.LANHostConfigManagement?.MACAddress?._value || '';
}

function getDeviceUptime(dev: any): string {
    const uptimeSeconds = dev.InternetGatewayDevice?.DeviceInfo?.UpTime?._value || dev.Device?.DeviceInfo?.UpTime?._value || 0;
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
    const temp = dev.VirtualParameters?.gettemp?._value || dev.VirtualParameters?.Temperature?._value || 
        dev.InternetGatewayDevice?.DeviceInfo?.Temperature?._value || dev.Device?.DeviceInfo?.Temperature?._value || '';
    if (!temp) return '';
    const strTemp = String(temp);
    if (!strTemp.includes('.') && strTemp.length > 2) {
        const numTemp = parseFloat(strTemp);
        if (numTemp > 500) return (numTemp / 256).toFixed(1);
        if (numTemp > 200) return (numTemp / 10).toFixed(1);
    }
    return strTemp;
}

function getDeviceClientCount(dev: any): number {
    if (dev.VirtualParameters?.ConnectedDevices?._value !== undefined) return dev.VirtualParameters.ConnectedDevices._value;
    const directCount = dev.InternetGatewayDevice?.Hosts?.HostNumberOfEntries?._value || dev.Device?.Hosts?.HostNumberOfEntries?._value;
    if (directCount !== undefined) return parseInt(directCount);
    return 0;
}

export function getWanConnections(dev: any): any[] {
    const connections: any[] = [];
    const isTr181 = !!dev.Device;
    const rootPath = isTr181 ? 'Device' : 'InternetGatewayDevice';
    const wanDevice = dev[rootPath]?.WANDevice?.[1];
    if (!wanDevice?.WANConnectionDevice) return [];

    Object.keys(wanDevice.WANConnectionDevice).forEach(key => {
        if (key.startsWith('_')) return;
        const wanConnDevice = wanDevice.WANConnectionDevice[key];
        const basePath = `${rootPath}.WANDevice.1.WANConnectionDevice.${key}`;

        const processConn = (conns: any, subName: string, type: string) => {
            Object.keys(conns).forEach(pKey => {
                if (pKey.startsWith('_')) return;
                const conn = conns[pKey];
                connections.push({
                    path: `${basePath}.${subName}.${pKey}`,
                    name: conn.Name?._value || `${type}-${key}-${pKey}`,
                    type, status: conn.ConnectionStatus?._value || 'Unknown',
                    externalIp: conn.ExternalIPAddress?._value,
                    mac: conn.MACAddress?._value,
                    username: conn.Username?._value,
                    password: conn.Password?._value,
                    vlanId: conn.VLANID?._value || conn['X_ZTE_COM_VLANID']?._value || conn['X_ZTE-COM_VLANID']?._value || conn['X_FH_VLANID']?._value || conn['X_CT-COM_VLANID']?._value,
                    serviceList: conn.ServiceList?._value || conn['X_CT-COM_ServiceList']?._value || conn['X_FH_ServiceList']?._value || conn['X_ZTE-COM_ServiceList']?._value || '',
                    mode: conn.ConnectionType?._value?.includes('Bridged') ? 'Bridge' : 'Route',
                    bindPorts: (conn['X_CT-COM_BindPort']?._value || conn['X_FH_LanInterface']?._value || conn['X_ZTE-COM_LanInterface']?._value || '').split(',').filter(Boolean),
                    isManagement: (key === '1' && pKey === '1') || (conn.Name?._value || '').toUpperCase().includes('TR069')
                });
            });
        };
        processConn(wanConnDevice.WANPPPConnection || {}, 'WANPPPConnection', 'PPPoE');
        processConn(wanConnDevice.WANIPConnection || {}, 'WANIPConnection', 'IP');
    });
    return connections;
}

export async function syncMetadata(routerId?: string, tenantId?: string) {
    let added = 0; let updated = 0; let total = 0;
    try {
        if (tenantId) {
            if (!(await settingsService.getSettingValue<boolean>('genieacs_enabled', tenantId, true))) return { added, updated, total };
            if (!routerId && !(await settingsService.getSettingValue<boolean>('acs_sync_enabled', tenantId, true))) return { added, updated, total };
        }
        await cacheService.invalidatePrefix(`genieacs:devices:${tenantId || 'all'}`);
        const devices = await getDevices(routerId, tenantId);
        total = devices.length;

        for (const dev of devices) {
            if (!dev._serialNumber) continue;
            const sn = dev._serialNumber;
            const filters = [eq(onus.sn, sn)];
            if (tenantId) filters.push(eq(onus.tenantId, tenantId));
            const [existing] = await db.select().from(onus).where(and(...filters));

            let resolvedRouterId = routerId || existing?.routerId;
            if (!resolvedRouterId && dev._ip) {
                const [matched] = await db.select({ routerId: routerNetwatch.routerId }).from(routerNetwatch).where(eq(routerNetwatch.host, dev._ip)).limit(1);
                if (matched) resolvedRouterId = matched.routerId;
            }

            let targetOnuId = existing?.id;
            if (existing) {
                const sources = (existing.discoverySources as string[]) || [];
                if (!sources.includes('acs')) sources.push('acs');
                await db.update(onus).set({
                    routerId: resolvedRouterId, model: dev._productClass || existing.model, ssid: dev._ssid || existing.ssid,
                    firmwareVersion: dev._softwareVersion || existing.firmwareVersion, host: dev._ip || existing.host,
                    lastRxPower: sources.includes('olt') && existing.lastRxPower !== null ? existing.lastRxPower : (dev._rxPower || existing.lastRxPower),
                    macAddress: dev._macAddress || existing.macAddress, discoverySources: sources, updatedAt: new Date(),
                    lastSeen: dev._lastInform ? new Date(dev._lastInform) : existing.lastSeen,
                    lastSeenAcs: new Date(),
                }).where(eq(onus.id, existing.id));
                if (dev._rxPower && resolvedRouterId) {
                    const sig = oltService.parseSignal(dev._rxPower);
                    if (sig !== null) await db.insert(devicePerformanceHistory).values({ tenantId: tenantId || '', routerId: resolvedRouterId, onuId: existing.id, signal: sig, recordedAt: new Date() }).execute().catch(() => {});
                }
                updated++;
            } else {
                let status: any = 'unknown';
                if (dev._lastInform) status = (Date.now() - new Date(dev._lastInform).getTime() < 300000) ? 'online' : 'offline';
                
                const [newOnu] = await db.insert(onus).values({
                    sn: sn,
                    tenantId,
                    routerId: resolvedRouterId,
                    name: `ACS-${sn.slice(-4)}`,
                    model: dev._productClass,
                    ssid: dev._ssid,
                    firmwareVersion: dev._softwareVersion,
                    host: dev._ip,
                    lastRxPower: dev._rxPower,
                    macAddress: dev._macAddress,
                    status,
                    discoverySources: ['acs'],
                    lastSeen: dev._lastInform ? new Date(dev._lastInform) : undefined,
                    lastSeenAcs: new Date(),
                } as any).onConflictDoUpdate({
                    target: onus.sn,
                    set: {
                        model: dev._productClass || sql`onus.model`,
                        ssid: dev._ssid || sql`onus.ssid`,
                        firmwareVersion: dev._softwareVersion || sql`onus.firmware_version`,
                        host: dev._ip || sql`onus.host`,
                        lastRxPower: dev._rxPower || sql`onus.last_rx_power`,
                        macAddress: dev._macAddress || sql`onus.mac_address`,
                        status: status || sql`onus.status`,
                        discoverySources: sql`(
                            SELECT COALESCE(json_agg(DISTINCT x), '[]'::json)
                            FROM jsonb_array_elements_text(COALESCE(onus.discovery_sources::jsonb, '[]'::jsonb) || '["acs"]'::jsonb) t(x)
                        )`,
                        updatedAt: new Date(),
                        lastSeenAcs: new Date(),
                    } as any
                }).returning();

                if (newOnu) {
                    targetOnuId = newOnu.id;
                    if (dev._rxPower && resolvedRouterId) {
                        const sig = oltService.parseSignal(dev._rxPower);
                        if (sig !== null) await db.insert(devicePerformanceHistory).values({ tenantId: tenantId || '', routerId: resolvedRouterId, onuId: newOnu.id, signal: sig, recordedAt: new Date() }).execute().catch(() => {});
                    }
                }
                added++;
            }
            if (dev._ip && targetOnuId) await db.update(routerNetwatch).set({ linkedOnuId: targetOnuId }).where(eq(routerNetwatch.host, dev._ip)).catch(() => {});
        }
        return { added, updated, total };
    } catch (error) {
        logger.error({ err: error }, 'GenieACS syncMetadata Error');
        return { added: 0, updated: 0, total: 0 };
    }
}

/**
 * Get single device details
 */
export async function getDevice(deviceId: string, routerId?: string, tenantId?: string) {
    const cacheKey = `genieacs:device:${deviceId}`;
    const cached = await cacheService.get<any>(cacheKey);
    if (cached) return cached;

    try {
        const config = await getGenieAcsConfig(routerId, tenantId);
        if (!config) return null;
        const { url, auth, isDedicated } = config;
        let query: any = { _id: deviceId };

        if (routerId && !isDedicated) {
            const routerOnus = await db.select({ sn: onus.sn }).from(onus).innerJoin(olts, eq(onus.oltId, olts.id)).where(eq(olts.parentId, routerId));
            const snFilter = routerOnus.map((o: any) => o.sn).filter(Boolean);
            if (snFilter.length > 0) query['_deviceId._SerialNumber'] = { '$in': snFilter };
            else return null;
        }

        const response = await axios.get(`${url}/devices`, { params: { query: JSON.stringify(query) }, auth, timeout: 5000 });
        if (response.data?.length > 0) {
            const device = transformGenieACSDevice(response.data[0]);
            await cacheService.set(cacheKey, device, cacheService.TTL.GENIEACS_DEVICE);
            return device;
        }
        return null;
    } catch (error: any) {
        // Log the error for internal diagnostics
        logger.error({ 
            deviceId, 
            err: error?.message || String(error),
            code: error?.code
        }, 'GenieACS: Failed to fetch device');
        
        // Re-throw the error so the controller can handle HTTP status codes (404 vs 503/504)
        throw error;
    }
}

/**
 * Get Dashboard Stats
 */
export async function getDashboardStats(routerId?: string, tenantId?: string, force = false) {
    const cacheKey = `genieacs:stats:${tenantId || 'all'}:${routerId || 'all'}`;
    if (!force) {
        const cached = await cacheService.get<any>(cacheKey);
        if (cached) return cached;
    }

    const devices = await getDevices(routerId, tenantId, {}, force, 'stats');
    const stats = {
        total: devices.length, online: 0, offline: 0, avgUptimeSeconds: 0,
        signalDistribution: { excellent: 0, good: 0, fair: 0, poor: 0, noSignal: 0 },
        vendorDistribution: {} as Record<string, number>, modelDistribution: {} as Record<string, number>,
        recentActivity: devices.filter(d => d._lastInform).sort((a, b) => new Date(b._lastInform).getTime() - new Date(a._lastInform).getTime()).slice(0, 10)
    };

    devices.forEach(dev => {
        const isOnline = dev._lastInform ? (new Date(dev._lastInform).getTime() > Date.now() - 5 * 60 * 1000) : false;
        if (isOnline) stats.online++; else stats.offline++;
        const rxPower = parseFloat(dev._rxPower || '0');
        if (!dev._rxPower || rxPower === 0) stats.signalDistribution.noSignal++;
        else if (rxPower >= -20) stats.signalDistribution.excellent++;
        else if (rxPower >= -24) stats.signalDistribution.good++;
        else if (rxPower >= -27) stats.signalDistribution.fair++;
        else stats.signalDistribution.poor++;
        stats.vendorDistribution[dev._manufacturer || 'Unknown'] = (stats.vendorDistribution[dev._manufacturer || 'Unknown'] || 0) + 1;
        stats.modelDistribution[dev._productClass || 'Unknown'] = (stats.modelDistribution[dev._productClass || 'Unknown'] || 0) + 1;
    });

    await cacheService.set(cacheKey, stats, cacheService.TTL.GENIEACS_DEVICES);
    return stats;
}
