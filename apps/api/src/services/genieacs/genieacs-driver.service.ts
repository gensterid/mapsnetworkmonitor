import { GenieACSDevice, WanConfigPayload, WifiConfigPayload } from './genieacs-core.service.js';

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
            // Huawei Remote Access — multi-path best-effort. Different
            // Huawei firmwares (HG8245H, HG8546M, EG8141, EG8145V5,
            // HG8145V5, ONT-V3) expose REMOTE access under different
            // vendor paths. Action service splits these into separate
            // tasks, so each path is tried independently — the one that
            // exists succeeds, the others fail silently.
            if (config.remoteAccessEnable !== undefined) {
                const isTr181 = !!device.Device;
                const root = isTr181 ? 'Device.' : 'InternetGatewayDevice.';
                const val = config.remoteAccessEnable;
                // 1. TR-181/TR-098 standard
                addParam(`${root}UserInterface.RemoteAccess.Enable`, val, 'xsd:boolean');
                if (!isTr181) {
                    // 2. Common Huawei extension (HG8245H, EG8145)
                    addParam('InternetGatewayDevice.X_HW_RemoteAccess.Enable', val, 'xsd:boolean');
                    // 3. Older HG firmware path
                    addParam('InternetGatewayDevice.X_HW_DEVMGMT.RemoteWebAccess', val, 'xsd:boolean');
                    // 4. EG8145V5 / HG8145V5 — Security node
                    addParam('InternetGatewayDevice.X_HW_Security.WANAccessEnable', val, 'xsd:boolean');
                    addParam('InternetGatewayDevice.X_HW_Security.RemoteAccess.Enable', val, 'xsd:boolean');
                    // 5. Alternative naming on some firmwares
                    addParam('InternetGatewayDevice.X_HW_RemoteWebAccess.Enable', val, 'xsd:boolean');
                    addParam('InternetGatewayDevice.X_HW_RemoteAccess.WanAccessEnable', val, 'xsd:boolean');
                }
            }
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
