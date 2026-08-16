import axios from 'axios';
import { logger } from '../../lib/logger.js';
import { db } from '../../db/index.js';
import { onus, olts, devicePerformanceHistory, routerNetwatch } from '../../db/schema/index.js';
import { eq, and, or, sql } from 'drizzle-orm';
import { cacheService } from '../../lib/cache.js';
import { oltService } from '../olt.service.js';
import { settingsService } from '../settings.service.js';
import { GenieACSDevice, getGenieAcsConfig } from './genieacs-core.service.js';
import { checkSignalChange } from '../signal-alert.service.js';
import { env } from '../../config/env.js';
import { CircuitBreaker } from '../../lib/circuit-breaker.js';

// #1: Circuit-breaker per-tenant/router untuk GenieACS. Saat ACS `ECONNREFUSED`/
// timeout, key di-trip → panggilan berikutnya SHORT-CIRCUIT selama cooldown,
// menghentikan hammer + spam log tiap siklus. Auto half-open saat cooldown habis.
const genieBreaker = new CircuitBreaker({ baseMs: 60_000, maxMs: 10 * 60_000 });
function genieBreakerKey(routerId?: string, tenantId?: string): string {
    return `${tenantId || 'all'}:${routerId || 'all'}`;
}

/**
 * Ditrigger saat breaker GenieACS terbuka (short-circuit). Membawa
 * `code = 'ECONNREFUSED'` supaya handler route yang ADA memetakannya jadi 503
 * "GenieACS unreachable" (operator TETAP lihat ACS mati — tak dimask jadi "0
 * perangkat"). Flag `isCircuitOpen` dipakai `syncMetadata` untuk skip SENYAP
 * (bukan ERROR) di jalur latar.
 */
export class GenieAcsCircuitOpenError extends Error {
    readonly code = 'ECONNREFUSED';
    readonly isCircuitOpen = true;
    constructor(message = 'GenieACS tak terjangkau (circuit open — auto-retry saat cooldown habis)') {
        super(message);
        this.name = 'GenieAcsCircuitOpenError';
    }
}

/**
 * Get all devices from GenieACS
 */
export async function getDevices(routerId?: string, tenantId?: string, query: any = {}, force = false, projectionMode: 'full' | 'stats' = 'full'): Promise<GenieACSDevice[]> {
    const cacheKey = `genieacs:devices:${tenantId || 'all'}:${routerId || 'all'}:${JSON.stringify(query)}:${projectionMode}`;
    if (!force) {
        const cached = await cacheService.get<GenieACSDevice[]>(cacheKey);
        if (cached) return cached;
    }

    // #1: Bila ACS baru saja tak terjangkau (breaker terbuka), short-circuit:
    // LEMPAR error terklasifikasi (bukan return []). Route user → 503 (outage
    // terlihat, tak dimask jadi "0 perangkat"); syncMetadata → skip senyap.
    // Cek cache DULU (di atas) — cache segar tetap disajikan selama outage.
    // Berlaku utk `force` juga: satu-satunya pemanggil force = prewarm scheduler
    // yang memang harus tunduk pada cooldown (user tak pernah kirim force).
    const breakerKey = genieBreakerKey(routerId, tenantId);
    if (genieBreaker.isTripped(breakerKey)) {
        throw new GenieAcsCircuitOpenError();
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
            // NOTE: Do NOT include `Hosts.Host` array in the list-view projection.
            // GenieACS NBI is very slow to project the full Host[] array (observed
            // 2+ minutes for 33 devices, exceeding our axios timeout). Client count
            // falls back to WLANConfiguration.TotalAssociations or HostNumberOfEntries
            // which are scalar and fast. The single-device endpoint (`getDevice`)
            // does not use a projection, so device-details still receives full Hosts.Host.
            // Cover the SSID indices commonly used by ZTE/Huawei/FiberHome.
            // 3 sources per SSID (firmware varies):
            //   - TotalAssociations (most CPEs)
            //   - AssociatedDeviceNumberOfEntries (some Huawei)
            //   - AssociatedDevice subtree itself — FiberHome HG6145D2 only
            //     populates this path (proven via detail-view payload).
            //     Each entry is small (MAC + a few attrs) so projecting the
            //     subtree is fine, unlike Hosts.Host which is much larger.
            for (const idx of [1, 2, 3, 4, 5, 6, 7, 8]) {
                projection[`InternetGatewayDevice.LANDevice.1.WLANConfiguration.${idx}.TotalAssociations`] = 1;
                projection[`InternetGatewayDevice.LANDevice.1.WLANConfiguration.${idx}.AssociatedDeviceNumberOfEntries`] = 1;
                projection[`InternetGatewayDevice.LANDevice.1.WLANConfiguration.${idx}.AssociatedDevice`] = 1;
                projection[`Device.WiFi.SSID.${idx}.AssociatedDeviceNumberOfEntries`] = 1;
                projection[`Device.WiFi.SSID.${idx}.AssociatedDevice`] = 1;
            }
        }

        const response = await axios.get(`${url}/devices`, {
            params: { query: JSON.stringify(query), projection: Object.keys(projection).join(',') },
            auth, timeout: 10000
        });

        const result = response.data.map((dev: any) => transformGenieACSDevice(dev));
        await cacheService.set(cacheKey, result, cacheService.TTL.GENIEACS_DEVICES);
        genieBreaker.recordSuccess(breakerKey);
        return result;
    } catch (error: any) {
        const code = error?.code || error?.errno;
        const isConn = ['ECONNREFUSED', 'ETIMEDOUT', 'ECONNRESET', 'EHOSTUNREACH', 'ENOTFOUND', 'EAI_AGAIN'].includes(code)
            || /timeout|network|unreachable|aggregateerror/i.test(error?.message || '');
        if (isConn) {
            // Trip breaker + log SEKALI (WARN) alih-alih ERROR tiap siklus.
            const cooldownMs = genieBreaker.recordFailure(breakerKey);
            logger.warn({ code, routerId, tenantId, cooldownMs }, 'GenieACS unreachable — circuit opened (skip until cooldown)');
        } else {
            // Error non-koneksi (mis. 4xx/parse) → tetap ERROR, tak men-trip breaker.
            logger.error({ err: error?.message || String(error), code, routerId, tenantId }, 'GenieACS: Failed to fetch devices');
        }
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
        _connectedHosts: getConnectedHosts(dev),
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
    const parse = (v: any) => {
        if (v === undefined || v === null || v === '') return null;
        const n = parseInt(v);
        return isNaN(n) ? null : n;
    };
    const boolVal = (v: any) => {
        if (v === undefined || v === null) return undefined;
        if (typeof v === 'boolean') return v;
        const s = String(v).toLowerCase();
        if (s === 'true' || s === '1') return true;
        if (s === 'false' || s === '0') return false;
        return undefined;
    };

    // 1. Custom virtual parameter (explicit override set up by the operator)
    const vp = parse(dev.VirtualParameters?.ConnectedDevices?._value);
    if (vp !== null) return vp;

    // 2. PREFERRED: Count Host.X entries where Active=true — matches what
    //    the user sees in the Connected Devices list, and excludes stale
    //    DHCP lease entries that stay in the table after a device disconnects.
    const hostContainer =
        dev.InternetGatewayDevice?.LANDevice?.[1]?.Hosts?.Host ||
        dev.Device?.Hosts?.Host;
    if (hostContainer && typeof hostContainer === 'object') {
        let activeCount = 0;
        let anyActiveFlag = false;
        let totalEntries = 0;
        for (const key of Object.keys(hostContainer)) {
            if (key.startsWith('_')) continue;
            totalEntries++;
            const active = boolVal(hostContainer[key]?.Active?._value);
            if (active !== undefined) anyActiveFlag = true;
            if (active === true) activeCount++;
        }
        // If at least one entry reports the Active flag, trust filtered count.
        // If nothing reports Active (vendor doesn't populate it), fall through
        // to HostNumberOfEntries below — counting Host.X directly would over-
        // count stale entries.
        if (anyActiveFlag) return activeCount;
    }

    // 3. WiFi associations (2.4G + 5G) — usually reflects actively connected
    //    wireless clients in real time. Tries 3 sources per SSID, in order:
    //    a) TotalAssociations scalar (most CPEs, fastest)
    //    b) AssociatedDeviceNumberOfEntries scalar (FiberHome HG6145D2 etc.)
    //    c) Count AssociatedDevice.<i> children (last resort — only present
    //       when the detail-view payload is loaded; list-view projection
    //       doesn't include AssociatedDevice subtree)
    const wlanTr098 = dev.InternetGatewayDevice?.LANDevice?.[1]?.WLANConfiguration;
    const wifiSsidTr181 = dev.Device?.WiFi?.SSID;
    const wifiSources = [wlanTr098, wifiSsidTr181].filter(Boolean);
    for (const wlan of wifiSources) {
        if (typeof wlan !== 'object') continue;
        let wifiTotal = 0;
        let foundAny = false;
        for (const key of Object.keys(wlan)) {
            if (key.startsWith('_')) continue;
            const node = wlan[key];
            if (!node) continue;
            // a) TotalAssociations
            const ta = parse(node.TotalAssociations?._value);
            if (ta !== null) { wifiTotal += ta; foundAny = true; continue; }
            // b) AssociatedDeviceNumberOfEntries
            const adnoe = parse(node.AssociatedDeviceNumberOfEntries?._value);
            if (adnoe !== null) { wifiTotal += adnoe; foundAny = true; continue; }
            // c) Count AssociatedDevice children (only present in full payload)
            const ad = node.AssociatedDevice;
            if (ad && typeof ad === 'object') {
                let n = 0;
                for (const ck of Object.keys(ad)) {
                    if (ck.startsWith('_')) continue;
                    if (!/^\d+$/.test(ck)) continue;
                    const entry = ad[ck];
                    // Only count entries that look like real client records
                    // (must have a MAC field — avoids counting empty index slots
                    // some firmware leaves behind).
                    const hasMac = !!(entry?.AssociatedDeviceMACAddress?._value || entry?.MACAddress?._value);
                    if (hasMac) n++;
                }
                if (n > 0) { wifiTotal += n; foundAny = true; }
            }
        }
        if (foundAny) return wifiTotal;
    }

    // 4. LAN-scoped Hosts count (may include stale DHCP entries)
    const lanHosts = parse(dev.InternetGatewayDevice?.LANDevice?.[1]?.Hosts?.HostNumberOfEntries?._value);
    if (lanHosts !== null) return lanHosts;

    // 5. Top-level Hosts count (TR-098 root, may include stale entries)
    const tr098Top = parse(dev.InternetGatewayDevice?.Hosts?.HostNumberOfEntries?._value);
    if (tr098Top !== null) return tr098Top;

    // 6. Top-level Hosts count (TR-181 root)
    const tr181Top = parse(dev.Device?.Hosts?.HostNumberOfEntries?._value);
    if (tr181Top !== null) return tr181Top;

    // 7. Last resort: count all Host.X entries regardless of Active flag
    if (hostContainer && typeof hostContainer === 'object') {
        const count = Object.keys(hostContainer).filter(k => !k.startsWith('_')).length;
        if (count > 0) return count;
    }

    return 0;
}

/**
 * Extract the list of connected client hosts from a GenieACS device.
 * Supports both TR-098 (InternetGatewayDevice.LANDevice.1.Hosts.Host)
 * and TR-181 (Device.Hosts.Host). Returns only entries with at least
 * one identifiable field (hostname, IP, or MAC).
 */
export function getConnectedHosts(dev: any): Array<{
    hostname?: string;
    ipAddress?: string;
    macAddress?: string;
    active?: boolean;
    interfaceType?: string;
    leaseTime?: string;
}> {
    const hostsContainer =
        dev.InternetGatewayDevice?.LANDevice?.[1]?.Hosts?.Host ||
        dev.Device?.Hosts?.Host;
    if (!hostsContainer || typeof hostsContainer !== 'object') return [];

    const strVal = (v: any) => {
        if (v === undefined || v === null) return undefined;
        const s = String(v).trim();
        return s.length > 0 ? s : undefined;
    };
    const boolVal = (v: any) => {
        if (v === undefined || v === null) return undefined;
        if (typeof v === 'boolean') return v;
        const s = String(v).toLowerCase();
        if (s === 'true' || s === '1') return true;
        if (s === 'false' || s === '0') return false;
        return undefined;
    };

    const results: ReturnType<typeof getConnectedHosts> = [];
    for (const key of Object.keys(hostsContainer)) {
        if (key.startsWith('_')) continue;
        const h = hostsContainer[key];
        if (!h || typeof h !== 'object') continue;

        const hostname = strVal(h.HostName?._value);
        const ipAddress = strVal(h.IPAddress?._value);
        const macAddress = strVal(h.PhysAddress?._value ?? h.MACAddress?._value);
        const active = boolVal(h.Active?._value);
        const interfaceType = strVal(h.InterfaceType?._value ?? h.Layer2Interface?._value);
        const leaseTime = strVal(h.LeaseTimeRemaining?._value ?? h.X_LeaseTime?._value);

        if (!hostname && !ipAddress && !macAddress) continue;

        results.push({ hostname, ipAddress, macAddress, active, interfaceType, leaseTime });
    }

    // Put active entries first, then by IP for stable order
    results.sort((a, b) => {
        if (a.active !== b.active) return a.active === true ? -1 : b.active === true ? 1 : 0;
        return (a.ipAddress || '').localeCompare(b.ipAddress || '');
    });

    return results;
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

        // Some FiberHome firmwares store VLAN at the WANConnectionDevice
        // level under X_FH_WANGponLinkConfig.VLANID, NOT on the WANIPConnection
        // / WANPPPConnection child. The TR-069 management connection (Index 1)
        // commonly sits here with VLAN 100. Fallback to this when child lacks
        // its own VLAN value.
        const wcdLevelVlan = wanConnDevice?.X_FH_WANGponLinkConfig?.VLANID?._value
            ?? wanConnDevice?.X_FH_WANGponLinkConfig?.['VLANID']?._value;

        const processConn = (conns: any, subName: string, type: string) => {
            Object.keys(conns).forEach(pKey => {
                if (pKey.startsWith('_')) return;
                const conn = conns[pKey];
                // Vendor extension fallback chain — different OEMs name
                // the same field differently. Huawei (X_HW_*) was missing
                // before; user reported VLAN/ports kosong saat Edit ONU
                // Huawei. Order is broadest first then specific vendors.
                const vlanRaw = conn.VLANID?._value
                    ?? conn['X_HW_VLAN']?._value
                    ?? conn['X_ZTE_COM_VLANID']?._value
                    ?? conn['X_ZTE-COM_VLANID']?._value
                    ?? conn['X_FH_VLANID']?._value
                    ?? conn['X_CT-COM_VLANID']?._value
                    ?? wcdLevelVlan; // FiberHome WCD-level fallback
                const serviceListRaw = conn.ServiceList?._value
                    ?? conn['X_HW_ServiceList']?._value
                    ?? conn['X_HW_SERVICELIST']?._value
                    ?? conn['X_CT-COM_ServiceList']?._value
                    ?? conn['X_FH_ServiceList']?._value
                    ?? conn['X_ZTE-COM_ServiceList']?._value
                    ?? '';
                const bindPortsRaw = conn['X_HW_BindPhyPortInfo']?._value
                    ?? conn['X_HW_LANBinding']?._value
                    ?? conn['X_CT-COM_BindPort']?._value
                    ?? conn['X_FH_LanInterface']?._value
                    ?? conn['X_ZTE-COM_LanInterface']?._value
                    ?? '';
                const vlanIdNum = vlanRaw !== undefined && vlanRaw !== null && vlanRaw !== '' ? Number(vlanRaw) : undefined;

                // ConnectionStatus often empty/Object placeholder on
                // freshly-synced devices. Fallback: if we have an external
                // IP and Enable=true, treat as Connected. Else if Enable
                // is explicitly false, Disconnected. Else Unknown.
                const rawStatus = conn.ConnectionStatus?._value;
                const isEnable = conn.Enable?._value;
                const extIp = conn.ExternalIPAddress?._value;
                const derivedStatus = rawStatus
                    ? rawStatus
                    : (extIp && extIp !== '0.0.0.0'
                        ? 'Connected'
                        : (isEnable === false ? 'Disconnected' : 'Unknown'));

                connections.push({
                    path: `${basePath}.${subName}.${pKey}`,
                    name: conn.Name?._value || `${type}-${key}-${pKey}`,
                    type, status: derivedStatus,
                    externalIp: extIp,
                    mac: conn.MACAddress?._value,
                    username: conn.Username?._value,
                    password: conn.Password?._value,
                    vlanId: vlanIdNum && !isNaN(vlanIdNum) && vlanIdNum > 0 ? vlanIdNum : undefined,
                    vlanEnable: !!(vlanIdNum && vlanIdNum > 0),
                    serviceList: serviceListRaw,
                    mode: conn.ConnectionType?._value?.includes('Bridged') ? 'Bridge' : 'Route',
                    bindPorts: String(bindPortsRaw).split(',').map((s: string) => s.trim()).filter(Boolean),
                    dhcpServerEnable: conn.NATEnabled?._value !== undefined ? !!conn.NATEnabled?._value : undefined,
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

        // Cap alert redaman per cycle (anti-flood) — sama dengan OLT path.
        let signalAlertsCreated = 0;

        for (const dev of devices) {
            if (!dev._serialNumber) continue;
            const sn = dev._serialNumber;
            const filters = [eq(onus.sn, sn)];
            if (tenantId) filters.push(eq(onus.tenantId, tenantId));
            const [existing] = await db.select().from(onus).where(and(...filters));

            let resolvedRouterId = routerId || existing?.routerId;
            if (!resolvedRouterId && dev._ip) {
                // Tenant-scoped + ambiguity-safe netwatch lookup. RFC1918 IP commonly overlap
                // antar router (bahkan dalam 1 tenant), match by host saja bisa cross-attach.
                // Kalau tenantId tidak ada (sync global), JANGAN auto-resolve — biarkan NULL
                // supaya admin manual yang assign, daripada salah set ke router tenant lain.
                if (tenantId) {
                    const candidates = await db.select({ routerId: routerNetwatch.routerId })
                        .from(routerNetwatch)
                        .where(and(eq(routerNetwatch.host, dev._ip), eq(routerNetwatch.tenantId, tenantId)))
                        .limit(2);
                    if (candidates.length === 1) {
                        resolvedRouterId = candidates[0].routerId;
                    } else if (candidates.length > 1) {
                        logger.warn({ ip: dev._ip, sn, tenantId }, 'ACS sync: ambiguous netwatch host within tenant, leaving routerId unset');
                    }
                }
            }

            let targetOnuId = existing?.id;
            if (existing) {
                const sources = (existing.discoverySources as string[]) || [];
                if (!sources.includes('acs')) sources.push('acs');
                await db.update(onus).set({
                    routerId: resolvedRouterId, model: dev._productClass || existing.model, ssid: dev._ssid || existing.ssid,
                    firmwareVersion: dev._softwareVersion || existing.firmwareVersion, host: dev._ip || existing.host,
                    // Persist both kinds of WAN-side IP so the linkage layer can match a
                    // netwatch entry that monitors either the PPPoE IP or the TR-069 mgmt IP.
                    pppoeIp: dev._pppoeIp || existing.pppoeIp,
                    mgmtIp: dev._mgmtIp || existing.mgmtIp,
                    pppoeUser: dev._pppoeUser || existing.pppoeUser,
                    lastRxPower: sources.includes('olt') && existing.lastRxPower !== null ? existing.lastRxPower : (dev._rxPower || existing.lastRxPower),
                    macAddress: dev._macAddress || existing.macAddress, discoverySources: sources, updatedAt: new Date(),
                    lastSeen: dev._lastInform ? new Date(dev._lastInform) : existing.lastSeen,
                    lastSeenAcs: new Date(),
                    activeClients: typeof dev._clientCount === 'number' ? dev._clientCount : existing.activeClients,
                }).where(eq(onus.id, existing.id));
                if (dev._rxPower && resolvedRouterId) {
                    const sig = oltService.parseSignal(dev._rxPower);
                    if (sig !== null) await db.insert(devicePerformanceHistory).values({ tenantId: tenantId || '', routerId: resolvedRouterId, onuId: existing.id, signal: sig, recordedAt: new Date() }).execute().catch(() => {});
                }

                // Alert redaman dari ACS — HANYA untuk ONU yang sinyalnya
                // memang bersumber dari ACS (bukan OLT). Untuk ONU ber-OLT,
                // lastRxPower dipertahankan nilai OLT (line di atas) dan alert
                // sudah ditangani OLT sync path → di sini di-skip supaya tidak
                // double-alert + tidak mencampur ukuran OLT vs ACS.
                const acsOwnsSignal = !(sources.includes('olt') && existing.lastRxPower !== null);
                if (
                    acsOwnsSignal &&
                    dev._rxPower &&
                    resolvedRouterId &&
                    signalAlertsCreated < env.SIGNAL_MAX_ALERTS_PER_SYNC
                ) {
                    const created = await checkSignalChange({
                        routerId: resolvedRouterId,
                        tenantId: tenantId ?? null,
                        onuName: existing.name || sn,
                        sn,
                        source: 'acs', // sumber ACS (sisi ONU/CPE)
                        oldSignal: existing.lastRxPower, // baseline ACS sebelumnya
                        newSignal: dev._rxPower,
                    });
                    if (created) signalAlertsCreated++;
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
                    // ACS-discovered devices with no matching OLT ONU are almost always
                    // the CPE router behind the actual ONU (different SN from the GPON
                    // bridge device). Tagging them so the map and linkage layer can
                    // treat them as a separate device class.
                    deviceClass: 'cpe_router',
                    model: dev._productClass,
                    ssid: dev._ssid,
                    firmwareVersion: dev._softwareVersion,
                    host: dev._ip,
                    pppoeIp: dev._pppoeIp,
                    mgmtIp: dev._mgmtIp,
                    pppoeUser: dev._pppoeUser,
                    lastRxPower: dev._rxPower,
                    macAddress: dev._macAddress,
                    status,
                    discoverySources: ['acs'],
                    lastSeen: dev._lastInform ? new Date(dev._lastInform) : undefined,
                    lastSeenAcs: new Date(),
                    activeClients: typeof dev._clientCount === 'number' ? dev._clientCount : undefined,
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
                        activeClients: typeof dev._clientCount === 'number' ? dev._clientCount : sql`onus.active_clients`,
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
            if (dev._ip && targetOnuId) {
                // Multi-tenant safety: only link netwatch entries that belong
                // to the same tenant AND same router as the ACS device.
                // Without this guard, two tenants sharing private IPs (e.g.
                // 192.168.x.x) would cross-link each other's netwatch.
                const linkConditions = [eq(routerNetwatch.host, dev._ip)];
                if (tenantId) linkConditions.push(eq(routerNetwatch.tenantId, tenantId));
                if (resolvedRouterId) linkConditions.push(eq(routerNetwatch.routerId, resolvedRouterId));
                await db.update(routerNetwatch)
                    .set({ linkedOnuId: targetOnuId })
                    .where(and(...linkConditions))
                    .catch(() => {});
            }
        }
        return { added, updated, total };
    } catch (error: any) {
        // Breaker terbuka → skip SENYAP (bukan ERROR tiap siklus). Error nyata
        // (kegagalan pertama yang men-trip breaker) tetap ter-log sekali.
        if (error?.isCircuitOpen) {
            logger.debug({ routerId, tenantId }, 'ACS syncMetadata dilewati — GenieACS circuit open (cooldown)');
            return { added, updated, total };
        }
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
