import { BaseOltDriver, type OnuInfo } from './olt-driver.interface.js';
import { logger } from '../../lib/logger.js';

export class DummyOltDriver extends BaseOltDriver {
    async connect(): Promise<void> {
        this.connected = true;
        logger.info({ host: this.config.host }, '🛠️ Connected to Dummy OLT Driver');
    }

    async disconnect(): Promise<void> {
        this.connected = false;
        logger.info({ host: this.config.host }, '🔌 Disconnected from Dummy OLT Driver');
    }

    async getOnuList(): Promise<OnuInfo[]> {
        const type = this.config.host.includes('10.0.0.10') ? 'CDATA' : 'HSGQ';

        return [
            {
                ponId: 'gpon0/1',
                onuId: '1',
                sn: `DMY-${type}-0001`,
                status: 'online',
                signal: '-18.5 dBm',
                distance: 120,
                name: 'PELANGGAN-DUMMY-01',
                description: 'CCTV Office'
            },
            {
                ponId: 'gpon0/1',
                onuId: '2',
                sn: `DMY-${type}-0002`,
                status: 'offline',
                lastDownReason: 'Power Down',
                name: 'PELANGGAN-DUMMY-02'
            },
            {
                ponId: 'gpon0/2',
                onuId: '1',
                sn: `DMY-${type}-0003`,
                status: 'online',
                signal: '-22.1 dBm',
                distance: 450,
                name: 'PELANGGAN-DUMMY-03'
            }
        ];
    }

    async getOnuDetails(ponId: string, onuId: string): Promise<OnuInfo | null> {
        const list = await this.getOnuList();
        return list.find(o => o.ponId === ponId && o.onuId === onuId) || null;
    }

    async rebootOnu(ponId: string, onuId: string): Promise<boolean> {
        logger.info({ ponId, onuId }, '🛠️ Dummy Rebooting ONU');
        return true;
    }

    async testConnection(): Promise<{ success: boolean; error?: string }> {
        return { success: true };
    }
}
