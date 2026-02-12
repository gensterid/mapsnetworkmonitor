import axios from 'axios';

const GENIEACS_URL = process.env.GENIEACS_URL || 'http://localhost:7557';

export interface GenieACSDevice {
    _id: string;
    _registered: string;
    _lastInform: string;
    _ip: string;
    _mac: string;
    _productClass: string;
    _serialNumber: string;
    InternetGatewayDevice?: any;
    Device?: any;
}

export const genieacsService = {
    /**
     * Get all devices from GenieACS
     * Supports MongoDB-style query
     */
    getDevices: async (query: any = {}): Promise<GenieACSDevice[]> => {
        try {
            const projection = {
                _id: 1,
                _registered: 1,
                _lastInform: 1,
                '_deviceId._SerialNumber': 1,
                '_deviceId._ProductClass': 1,
                '_deviceId._OUI': 1,
                '_deviceId._Manufacturer': 1,
                'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANIPConnection.1.ExternalIPAddress': 1,
                'InternetGatewayDevice.WANDevice.1.WANConnectionDevice.1.WANPPPConnection.1.ExternalIPAddress': 1,
                'InternetGatewayDevice.LANDevice.1.WLANConfiguration.1.SSID': 1,
                'Device.WiFi.SSID.1.SSID': 1,
            };

            const response = await axios.get(`${GENIEACS_URL}/devices`, {
                params: {
                    query: JSON.stringify(query),
                    projection: Object.keys(projection).join(',')
                },
                timeout: 5000
            });

            return response.data.map((dev: any) => ({
                _id: dev._id,
                _registered: dev._registered,
                _lastInform: dev._lastInform,
                _serialNumber: dev._deviceId?._SerialNumber,
                _productClass: dev._deviceId?._ProductClass,
                _manufacturer: dev._deviceId?._Manufacturer,
                _ip: getDeviceIp(dev),
                _ssid: getDeviceSsid(dev)
            }));
        } catch (error) {
            console.error('GenieACS Error:', error instanceof Error ? error.message : error);
            // Return empty array instead of crashing if GenieACS is down
            return [];
        }
    },

    /**
     * Get single device details
     */
    getDevice: async (deviceId: string) => {
        try {
            const response = await axios.get(`${GENIEACS_URL}/devices/${deviceId}`, {
                timeout: 5000
            });
            return response.data;
        } catch (error) {
            console.error(`GenieACS Device ${deviceId} Error:`, error instanceof Error ? error.message : error);
            return null;
        }
    },

    /**
     * Reboot device
     */
    rebootDevice: async (deviceId: string) => {
        try {
            await axios.post(`${GENIEACS_URL}/devices/${deviceId}/tasks?timeout=3000&connection_request`, {
                name: 'reboot'
            });
            return { success: true };
        } catch (error) {
            return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
        }
    }
};

// Helper to extract IP from common paths
function getDeviceIp(dev: any): string {
    return dev.InternetGatewayDevice?.WANDevice?.[1]?.WANConnectionDevice?.[1]?.WANPPPConnection?.[1]?.ExternalIPAddress?._value ||
        dev.InternetGatewayDevice?.WANDevice?.[1]?.WANConnectionDevice?.[1]?.WANIPConnection?.[1]?.ExternalIPAddress?._value ||
        '';
}

function getDeviceSsid(dev: any): string {
    return dev.InternetGatewayDevice?.LANDevice?.[1]?.WLANConfiguration?.[1]?.SSID?._value ||
        dev.Device?.WiFi?.SSID?.[1]?.SSID?._value ||
        '';
}
