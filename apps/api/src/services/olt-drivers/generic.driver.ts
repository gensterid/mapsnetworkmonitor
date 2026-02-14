import { BaseOltDriver, OnuInfo } from './olt-driver.interface.js';

export class GenericDriver extends BaseOltDriver {
    async connect(): Promise<void> {
        // Generic driver doesn't maintain a persistent connection
        this.connected = true;
    }

    async disconnect(): Promise<void> {
        this.connected = false;
    }

    async getOnuList(): Promise<OnuInfo[]> {
        console.warn('getOnuList not supported for Generic OLT driver.');
        return [];
    }

    async getOnuDetails(ponId: string, onuId: string): Promise<OnuInfo | null> {
        return null;
    }

    async rebootOnu(ponId: string, onuId: string): Promise<boolean> {
        console.warn('rebootOnu not supported for Generic OLT driver.');
        return false;
    }
}
