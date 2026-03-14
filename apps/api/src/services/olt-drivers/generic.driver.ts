import { BaseOltDriver, OnuInfo } from './olt-driver.interface.js';
import { logger } from '../../lib/logger.js';

export class GenericDriver extends BaseOltDriver {
    async connect(): Promise<void> {
        // Generic driver doesn't maintain a persistent connection
        this.connected = true;
    }

    async disconnect(): Promise<void> {
        this.connected = false;
    }

    async getOnuList(): Promise<OnuInfo[]> {
        logger.warn('getOnuList not supported for Generic OLT driver.');
        return [];
    }

    async getOnuDetails(ponId: string, onuId: string): Promise<OnuInfo | null> {
        return null;
    }

    async rebootOnu(ponId: string, onuId: string): Promise<boolean> {
        logger.warn('rebootOnu not supported for Generic OLT driver.');
        return false;
    }

    async testConnection(): Promise<{ success: boolean; error?: string }> {
        // For generic drivers, we can just check if the host responds on the web port if useWeb is enabled
        if (this.config.protocol === 'http' || this.config.protocol === 'https' || this.config.port === 80 || this.config.port === 443) {
            const protocol = this.config.protocol || (this.config.port === 443 ? 'https' : 'http');
            const baseUrl = `${protocol}://${this.config.host}:${this.config.port}`;
            try {
                const response = await fetch(baseUrl, { method: 'HEAD', signal: AbortSignal.timeout(5000) }).catch(() => null);
                if (response && (response.ok || response.status === 401 || response.status === 403)) {
                    return { success: true };
                }
                return { success: false, error: 'Web Port Reachable but returned error status' };
            } catch (e: any) {
                return { success: false, error: `Connection Failed: ${e.message}` };
            }
        }
        return { success: true }; // Assume true if not web-based generic
    }
}
