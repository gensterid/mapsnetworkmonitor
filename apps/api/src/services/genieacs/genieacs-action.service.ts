import axios from 'axios';
import { logger } from '../../lib/logger.js';
import { cacheService } from '../../lib/cache.js';
import { getGenieAcsConfig, WanConfigPayload, WifiConfigPayload } from './genieacs-core.service.js';
import { findDriver } from './genieacs-driver.service.js';
import { getDevice, getWanConnections } from './genieacs-device.service.js';

export async function updateWanConfig(deviceId: string, config: WanConfigPayload, routerId?: string, tenantId?: string) {
    try {
        const acsConfig = await getGenieAcsConfig(routerId, tenantId);
        if (!acsConfig) return { success: false, error: 'GenieACS: No configuration found' };
        const { url, auth } = acsConfig;
        const encodedId = encodeURIComponent(deviceId);

        const device = await getDevice(deviceId, routerId, tenantId);
        if (!device) return { success: false, error: 'Device not found' };
        const driver = findDriver(device);
        const rootPath = driver?.rootPath || (!!device.Device ? 'Device.' : 'InternetGatewayDevice.');

        const globalParams: [string, any, string?][] = [];
        const addGlobalParam = (path: string, val: any, type: string = 'xsd:string') => globalParams.push([path, val, type]);

        if (config.dhcpServerEnable !== undefined) {
             const lanPath = rootPath === 'Device.' ? 'Device.WiFi.Radio.1.' : 'InternetGatewayDevice.LANDevice.1.LANHostConfigManagement.';
             addGlobalParam(lanPath + (rootPath === 'Device.' ? 'Enable' : 'DHCPServerEnable'), config.dhcpServerEnable, 'xsd:boolean');
        }
        if (driver?.onGlobalUpdate) driver.onGlobalUpdate(globalParams, config, device, addGlobalParam);

        if (globalParams.length > 0) {
            await axios.post(`${url}/devices/${encodedId}/tasks?connection_request`, { name: 'setParameterValues', parameterValues: globalParams }, { auth }).catch(() => {});
        }

        let connectionPath = config.connectionPath;
        if (!connectionPath) {
            const connections = getWanConnections(device);
            const isBridge = config.connectionMode === 'bridge';
            const existing = connections.find(c => {
                const name = (c.name || '').toUpperCase();
                const isInternet = name.includes('INTERNET') || name.includes('WAN');
                const isBridgeConn = isBridge && name.includes('BRIDGE');
                return (isInternet || isBridgeConn) && c.type === (config.wanType === 'pppoe' ? 'PPPoE' : 'IP');
            });
            if (existing) connectionPath = existing.path;
        }

        if (!connectionPath) {
            const wcdIndex = driver?.getNewWcdIndex ? driver.getNewWcdIndex(device) : 1;
            const subName = config.wanType === 'pppoe' ? 'WANPPPConnection' : 'WANIPConnection';
            const targetWcdPath = `${rootPath}WANDevice.1.WANConnectionDevice.${wcdIndex}`;
            
            try {
                const root = device.InternetGatewayDevice || device.Device;
                if (!root?.WANDevice?.['1']?.WANConnectionDevice?.[wcdIndex.toString()]) {
                    await axios.post(`${url}/devices/${encodedId}/tasks`, { name: 'addObject', objectName: `${rootPath}WANDevice.1.WANConnectionDevice` }, { auth });
                }
                await axios.post(`${url}/devices/${encodedId}/tasks`, { name: 'addObject', objectName: `${targetWcdPath}.${subName}` }, { auth });
                connectionPath = `${targetWcdPath}.${subName}.1`; // Fallback to index 1 or dynamic if possible
            } catch (e) { connectionPath = `${targetWcdPath}.${subName}.1`; }
        }

        const parameters: [string, any, string?][] = [];
        const addParam = (path: string, val: any, type: string = 'xsd:string') => parameters.push([`${connectionPath}.${path}`, val, type]);

        if (driver?.onWanUpdate) driver.onWanUpdate(parameters, config, device, addParam);

        if (config.enable !== undefined && !parameters.some(p => p[0].endsWith('.Enable'))) addParam('Enable', config.enable, 'xsd:boolean');
        if (config.wanType === 'pppoe') {
            if (config.username) addParam('Username', config.username);
            if (config.password) addParam('Password', config.password);
            const isBridge = config.connectionMode === 'bridge';
            addParam('ConnectionType', isBridge ? 'PPPoE_Bridged' : 'PPPoE_Routed');
            if (!parameters.some(p => p[0].endsWith('.NATEnabled')) && !(config as any)._skipNat) addParam('NATEnabled', !isBridge, 'xsd:boolean');
        } else {
            const isBridge = config.connectionMode === 'bridge';
            addParam('ConnectionType', isBridge ? 'IP_Bridged' : 'IP_Routed');
            if (!parameters.some(p => p[0].endsWith('.NATEnabled')) && !(config as any)._skipNat) addParam('NATEnabled', !isBridge, 'xsd:boolean');
            if (config.addressingType) addParam('AddressingType', config.addressingType);
            if (config.addressingType === 'Static') {
                if (config.ipAddress) addParam('ExternalIPAddress', config.ipAddress);
                if (config.subnetMask) addParam('SubnetMask', config.subnetMask);
                if (config.defaultGateway) addParam('DefaultGateway', config.defaultGateway);
                if (config.dnsServers) addParam('DNSServers', config.dnsServers);
            }
        }

        if (parameters.length === 0) return { success: true, message: 'Updated' };

        const response = await axios.post(`${url}/devices/${encodedId}/tasks?timeout=3000&connection_request`, { name: 'setParameterValues', parameterValues: parameters }, { auth });
        await cacheService.delete(`genieacs:device:${deviceId}`);
        await cacheService.invalidatePrefix('genieacs:devices');
        
        if (response.status < 300) {
            axios.post(`${url}/devices/${encodedId}/tasks?connection_request`, { name: 'refreshObject', objectName: connectionPath }, { auth }).catch(() => {});
        }
        return { success: true, taskId: response.data?._id };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

export async function deleteWanConnection(deviceId: string, connectionPath: string, routerId?: string, tenantId?: string) {
    try {
        if (connectionPath.includes('.1.') || connectionPath.toUpperCase().includes('TR069')) return { success: false, error: 'Cannot delete management interface' };
        const acsConfig = await getGenieAcsConfig(routerId, tenantId);
        if (!acsConfig) return { success: false, error: 'No config' };
        const { url, auth } = acsConfig;
        const encodedId = encodeURIComponent(deviceId);

        const dev = await getDevice(deviceId, routerId, tenantId);
        let targetPath = connectionPath;
        if (dev) {
             const driver = findDriver(dev);
             if (driver?.onWanDelete) targetPath = driver.onWanDelete(deviceId, connectionPath);
        }

        const response = await axios.post(`${url}/devices/${encodedId}/tasks?connection_request`, { name: 'deleteObject', objectName: targetPath }, { auth });
        const parentPath = targetPath.split('.').slice(0, -1).join('.');
        if (parentPath) axios.post(`${url}/devices/${encodedId}/tasks?connection_request`, { name: 'refreshObject', objectName: parentPath }, { auth }).catch(() => {});
        
        await cacheService.delete(`genieacs:device:${deviceId}`);
        await cacheService.invalidatePrefix('genieacs:devices');
        return { success: true, taskId: response.data?._id };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

export async function updateWifiConfig(deviceId: string, config: WifiConfigPayload, routerId?: string, tenantId?: string) {
    try {
        const acsConfig = await getGenieAcsConfig(routerId, tenantId);
        if (!acsConfig) return { success: false, error: 'No config' };
        const { url, auth } = acsConfig;
        const encodedId = encodeURIComponent(deviceId);

        const device = await getDevice(deviceId, routerId);
        if (!device) return { success: false, error: 'Device not found' };

        const driver = findDriver(device);
        const isTr181 = !!device.Device;
        const index = config.ssidIndex || 1;
        const basePath = isTr181 ? `Device.WiFi.SSID.${index}` : `InternetGatewayDevice.LANDevice.1.WLANConfiguration.${index}`;

        const parameters: [string, any, string?][] = [];
        const addParam = (path: string, val: any, type: string = 'xsd:string') => parameters.push([`${basePath}.${path}`, val, type]);

        if (config.enable !== undefined) {
             addParam('Enable', config.enable, 'xsd:boolean');
             if (driver?.onWifiUpdate) driver.onWifiUpdate(parameters, config, device, addParam);
        }
        if (config.ssid) addParam('SSID', config.ssid);
        if (config.password) {
            if (isTr181) parameters.push([`Device.WiFi.AccessPoint.${index}.Security.KeyPassphrase`, config.password, 'xsd:string']);
            else { addParam('KeyPassphrase', config.password); addParam('PreSharedKey', config.password); }
        }

        if (!isTr181 && config.securityMode) {
            if (config.securityMode === 'Open' || config.securityMode === 'None') {
                addParam('BeaconType', 'None');
                addParam('WPAEncryptionModes', 'None');
            } else if (config.securityMode === 'WPA2-PSK') {
                addParam('BeaconType', '11i');
                addParam('IEEE11iAuthenticationMode', 'PSKAuthentication');
                addParam('IEEE11iEncryptionModes', 'AESEncryption');
            }
            // Other modes can be added if needed, kept it simple for now as per refactor
        }

        if (parameters.length === 0) return { success: false, error: 'Nothing to update' };

        const response = await axios.post(`${url}/devices/${encodedId}/tasks?timeout=3000&connection_request`, { name: 'setParameterValues', parameterValues: parameters }, { auth });
        await cacheService.delete(`genieacs:device:${deviceId}`);
        await cacheService.invalidatePrefix('genieacs:devices');
        
        if (response.status < 300) {
            axios.post(`${url}/devices/${encodedId}/tasks?connection_request`, { name: 'refreshObject', objectName: basePath }, { auth }).catch(() => {});
        }
        return { success: true, taskId: response.data?._id };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
}

export async function rebootDevice(deviceId: string, routerId?: string, tenantId?: string) {
    try {
        const config = await getGenieAcsConfig(routerId, tenantId);
        const encodedId = encodeURIComponent(deviceId);
        await axios.post(`${config!.url}/devices/${encodedId}/tasks?timeout=3000&connection_request`, { name: 'reboot' }, { auth: config!.auth });
        await cacheService.delete(`genieacs:device:${deviceId}`);
        await cacheService.invalidatePrefix('genieacs:devices');
        return { success: true };
    } catch (error) { return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }; }
}

export async function factoryReset(deviceId: string, routerId?: string, tenantId?: string) {
    try {
        const config = await getGenieAcsConfig(routerId, tenantId);
        const encodedId = encodeURIComponent(deviceId);
        await axios.post(`${config!.url}/devices/${encodedId}/tasks?timeout=3000&connection_request`, { name: 'factoryReset' }, { auth: config!.auth });
        return { success: true };
    } catch (error) { return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }; }
}

export async function refreshDevice(deviceId: string, routerId?: string, tenantId?: string) {
    try {
        const config = await getGenieAcsConfig(routerId, tenantId);
        const encodedId = encodeURIComponent(deviceId);
        const objects = ['InternetGatewayDevice.DeviceInfo', 'Device.DeviceInfo', 'InternetGatewayDevice.LANDevice.1.WLANConfiguration'];
        for (const obj of objects) {
            await axios.post(`${config!.url}/devices/${encodedId}/tasks?timeout=1500&connection_request`, { name: 'refreshObject', objectName: obj }, { auth: config!.auth }).catch(() => {});
        }
        await cacheService.delete(`genieacs:device:${deviceId}`);
        await cacheService.invalidatePrefix('genieacs:devices');
        return { success: true };
    } catch (error) { return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }; }
}

export async function setParameter(deviceId: string, parameterName: string, value: any, type: string = 'xsd:string', routerId?: string, tenantId?: string) {
    try {
        const config = await getGenieAcsConfig(routerId, tenantId);
        const encodedId = encodeURIComponent(deviceId);
        await axios.post(`${config!.url}/devices/${encodedId}/tasks?timeout=3000&connection_request`, { name: 'setParameterValues', parameterValues: [[parameterName, value, type]] }, { auth: config!.auth });
        await cacheService.delete(`genieacs:device:${deviceId}`);
        await cacheService.invalidatePrefix('genieacs:devices');
        return { success: true };
    } catch (error) { return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }; }
}

export async function updateAcsSettings(deviceId: string, settings: { url: string, username?: string, password?: string }, routerId?: string, tenantId?: string) {
    try {
        const device = await getDevice(deviceId, routerId, tenantId);
        if (!device) return { success: false, error: 'Not found' };
        const driver = findDriver(device);
        const root = driver?.rootPath || (!!device.Device ? 'Device.' : 'InternetGatewayDevice.');
        const basePath = `${root}ManagementServer`;
        const params: [string, any, string?][] = [[`${basePath}.URL`, settings.url, 'xsd:string']];
        if (settings.username) params.push([`${basePath}.Username`, settings.username, 'xsd:string']);
        if (settings.password) params.push([`${basePath}.Password`, settings.password, 'xsd:string']);

        const config = await getGenieAcsConfig(routerId, tenantId);
        const response = await axios.post(`${config!.url}/devices/${encodeURIComponent(deviceId)}/tasks?connection_request`, { name: 'setParameterValues', parameterValues: params }, { auth: config!.auth });
        return { success: true, taskId: response.data?._id };
    } catch (error) { return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }; }
}

export async function bulkReboot(deviceIds: string[], routerId?: string, tenantId?: string) {
    const results = { success: 0, failed: 0, errors: [] as string[] };
    await Promise.all(deviceIds.map(async (id) => {
        const res = await rebootDevice(id, routerId, tenantId);
        if (res.success) results.success++; else { results.failed++; results.errors.push(`${id}: ${res.error}`); }
    }));
    return results;
}

export async function bulkPushConfig(deviceIds: string[], type: 'wan' | 'wifi', config: any, routerId?: string, tenantId?: string) {
    const results = { success: 0, failed: 0, errors: [] as string[] };
    await Promise.all(deviceIds.map(async (id) => {
        const res = type === 'wan' ? await updateWanConfig(id, config, routerId) : await updateWifiConfig(id, config, routerId);
        if (res.success) results.success++; else { results.failed++; results.errors.push(`${id}: ${res.error}`); }
    }));
    return results;
}
