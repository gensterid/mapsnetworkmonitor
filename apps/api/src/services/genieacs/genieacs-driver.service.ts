import { GenieACSDevice, WanConfigPayload, WifiConfigPayload } from './genieacs-core.service.js';

/**
 * Result of postGlobalUpdate — describes additional GenieACS tasks the
 * driver wants to fire AFTER the standard global setParameterValues.
 *
 * Used for vendor flows that need addObject + setParameterValues
 * sequence (e.g. Huawei ACL WanAccess entry creation: addObject the
 * list, then set Protocol/Enable on the new index).
 */
export interface PostGlobalTask {
    addObject?: string;            // path to addObject (optional)
    setParams?: [string, any, string?][]; // params to set after addObject
}

// Device Driver Interface for model-specific overrides
export interface GenieACSDeviceDriver {
    name: string;
    description?: string;
    rootPath?: 'InternetGatewayDevice.' | 'Device.';
    onWanUpdate?: (params: any[], config: WanConfigPayload, device: any, addParam: (name: string, value: any, type?: string) => void) => void;
    onWifiUpdate?: (params: any[], config: WifiConfigPayload, device: any, addParam: (name: string, value: any, type?: string) => void) => void;
    onGlobalUpdate?: (params: any[], config: WanConfigPayload, device: any, addParam: (name: string, value: any, type?: string) => void) => void;
    onPostGlobalUpdate?: (config: WanConfigPayload, device: any) => PostGlobalTask[];
    onWanDelete?: (deviceId: string, connectionPath: string) => string;
    getNewWcdIndex?: (device: any) => number;
}

export const DEVICE_DRIVERS: Record<string, GenieACSDeviceDriver> = {
    'FIBERHOME:HG6243C': {
        name: 'FiberHome HG6243C',
        description: 'Specific driver for HG6243C model (TR-098)',
        onWanUpdate: (params, config, device, addParam) => {
            const isBridge = config.connectionMode === 'bridge';
            if (config.vlanId !== undefined) {
                addParam('VLANEnable', false, 'xsd:boolean');
                addParam('VLANID', config.vlanId, 'xsd:unsignedInt');
                const mode = isBridge ? 2 : 1;
                addParam('X_CT-COM_Mode', mode, 'xsd:unsignedInt');
                addParam('X_CT-COM_VLANID', config.vlanId, 'xsd:unsignedInt');
            }
            if (isBridge) {
                addParam('NATEnabled', true, 'xsd:boolean');
            }
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
                addParam('X_FH_VLANEnable', 1, 'xsd:unsignedInt');
                addParam('X_FH_VLANID', config.vlanId, 'xsd:unsignedInt');
                addParam('NATEnabled', !isBridge, 'xsd:boolean');
                addParam('X_FH_NATEnabled', !isBridge, 'xsd:boolean');
                (config as any)._skipNat = true;
            }
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
            if (config.vlanId !== undefined) {
                addParam('X_ZTE-COM_VLANEnable', 1, 'xsd:unsignedInt');
                addParam('X_ZTE-COM_VLANID', config.vlanId, 'xsd:unsignedInt');
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
                addParam('X_ZTE-COM_LanInterface', fullPaths.join(','));
            }
            if (!config.connectionPath) {
                addParam('Name', isBridge ? 'BRIDGE' : (isPppoe ? (config.username || 'internet') : 'internet'));
            }
            addParam('X_ZTE-COM_ServiceList', config.serviceList || 'INTERNET');
            if (isPppoe) {
                addParam('ConnectionType', isBridge ? 'PPPoE_Bridged' : 'PPPoE_Routed');
            } else {
                addParam('ConnectionType', isBridge ? 'IP_Bridged' : 'IP_Routed');
            }
            addParam('NATEnabled', !isBridge, 'xsd:boolean');
            (config as any)._skipNat = true;
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
        onGlobalUpdate: (params, config, device, addParam) => {
            // ZTE Remote Access — best effort across firmware variants.
            // We try the TR-181/TR-098 standard path first (UserInterface.
            // RemoteAccess.Enable) plus a ZTE vendor-extension fallback.
            // Different ZTE firmwares expose only one of these; sending
            // both means at least one usually applies. The other will be
            // recorded as a fault in GenieACS but doesn't prevent the
            // working one from taking effect.
            if (config.remoteAccessEnable !== undefined) {
                const isTr181 = !!device.Device;
                const root = isTr181 ? 'Device.' : 'InternetGatewayDevice.';
                addParam(`${root}UserInterface.RemoteAccess.Enable`, config.remoteAccessEnable, 'xsd:boolean');
                if (!isTr181) {
                    addParam('InternetGatewayDevice.X_ZTE-COM_FireWall.WANRemoteAccess', config.remoteAccessEnable, 'xsd:boolean');
                }
            }
        },
        getNewWcdIndex: (device) => {
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
        },
        onGlobalUpdate: (params, config, device, addParam) => {
            // Huawei Remote Access — STEP 1: master switches.
            // Verified on EG8145V5 / HG8145V5 (V5 series, common in ID
            // ISPs). Master switches alone NOT sufficient — V5 firmware
            // also requires an ACL entry under WanAccess list. See
            // onPostGlobalUpdate below for the addObject + Protocol set
            // that whitelists the actual access.
            if (config.remoteAccessEnable !== undefined) {
                const isTr181 = !!device.Device;
                const val = config.remoteAccessEnable;
                if (!isTr181) {
                    addParam('InternetGatewayDevice.X_HW_Security.AclServices.HTTPWanEnable', val, 'xsd:boolean');
                    addParam('InternetGatewayDevice.X_HW_Security.AclServices.SSHWanEnable', val, 'xsd:boolean');
                    addParam('InternetGatewayDevice.X_HW_Security.AclServices.TELNETWanEnable', val, 'xsd:boolean');
                    // Older HG firmware fallback
                    addParam('InternetGatewayDevice.X_HW_RemoteAccess.Enable', val, 'xsd:boolean');
                } else {
                    addParam('Device.UserInterface.RemoteAccess.Enable', val, 'xsd:boolean');
                }
            }
        },
        onPostGlobalUpdate: (config, device) => {
            // Huawei Remote Access — STEP 2: ACL whitelist entry.
            //
            // V5 series (EG8145V5/HG8145V5) blocks all WAN inbound by
            // default even with HTTPWanEnable=true. Need to addObject
            // a WanAccess entry then set Protocol=HTTP on it.
            //
            // From the device's own Config-Log earlier:
            //   ACS Type:Add, X_HW_Security.AclServices.WanAccess
            //   ACS Type:Set, WanAccess:1, Protocol:HTTP
            //
            // We replicate this when remoteAccessEnable=true. If the
            // entry already exists, addObject creates a new index;
            // GenieACS will accept and the Protocol set lands on the
            // new entry. Idempotent enough — operator can manually
            // delete extra entries if they pile up.
            if (config.remoteAccessEnable !== true) return [];
            const isTr181 = !!device.Device;
            if (isTr181) return []; // TR-181 firmware uses different model

            const tasks: PostGlobalTask[] = [];

            // Check existing WanAccess list to figure out next index
            const root = device.InternetGatewayDevice;
            const existingWanAccess = root?.X_HW_Security?.AclServices?.WanAccess || {};
            const existingKeys = Object.keys(existingWanAccess).filter(k => /^\d+$/.test(k));

            // ACL rule needs FOUR params filled to actually allow access:
            //   Protocol     — HTTP/SSH/TELNET (which service to allow)
            //   Enable       — 1 (rule active)
            //   WanName      — "ANY" or specific connection name (which WAN scope)
            //   SrcIPPrefix  — "0.0.0.0/0" or specific prefix (which sources allowed)
            // Without WanName + SrcIPPrefix, rule has no scope → all inbound
            // still blocked even though Protocol+Enable look correct.
            if (existingKeys.length === 0) {
                tasks.push({
                    addObject: 'InternetGatewayDevice.X_HW_Security.AclServices.WanAccess',
                    setParams: [
                        ['InternetGatewayDevice.X_HW_Security.AclServices.WanAccess.1.Protocol', 'HTTP', 'xsd:string'],
                        ['InternetGatewayDevice.X_HW_Security.AclServices.WanAccess.1.Enable', 1, 'xsd:unsignedInt'],
                        ['InternetGatewayDevice.X_HW_Security.AclServices.WanAccess.1.WanName', 'ANY', 'xsd:string'],
                        ['InternetGatewayDevice.X_HW_Security.AclServices.WanAccess.1.SrcIPPrefix', '0.0.0.0/0', 'xsd:string'],
                    ],
                });
            } else {
                const idx = existingKeys[0];
                tasks.push({
                    setParams: [
                        [`InternetGatewayDevice.X_HW_Security.AclServices.WanAccess.${idx}.Protocol`, 'HTTP', 'xsd:string'],
                        [`InternetGatewayDevice.X_HW_Security.AclServices.WanAccess.${idx}.Enable`, 1, 'xsd:unsignedInt'],
                        [`InternetGatewayDevice.X_HW_Security.AclServices.WanAccess.${idx}.WanName`, 'ANY', 'xsd:string'],
                        [`InternetGatewayDevice.X_HW_Security.AclServices.WanAccess.${idx}.SrcIPPrefix`, '0.0.0.0/0', 'xsd:string'],
                    ],
                });
            }
            return tasks;
        }
    }
};

/**
 * Identify the appropriate driver for a device
 */
export function findDriver(device: GenieACSDevice): GenieACSDeviceDriver | null {
    const manufacturer = (device._deviceId?._Manufacturer || '').toUpperCase();
    const productClass = (device._productClass || '').toUpperCase();
    const modelKey = `${manufacturer}:${productClass}`;
    
    if (DEVICE_DRIVERS[modelKey]) return DEVICE_DRIVERS[modelKey];
    
    if (manufacturer.includes('FIBERHOME') || manufacturer.includes('FH') || manufacturer.includes('FHTT')) {
        return DEVICE_DRIVERS['FIBERHOME:GENERIC'];
    }
    if (manufacturer.includes('ZTE')) return DEVICE_DRIVERS['ZTE:GENERIC'];
    if (manufacturer.includes('HUAWEI')) return DEVICE_DRIVERS['HUAWEI:GENERIC'];
    if (productClass.includes('HG6') || productClass.includes('AN5')) return DEVICE_DRIVERS['FIBERHOME:GENERIC'];
    
    return null;
}
