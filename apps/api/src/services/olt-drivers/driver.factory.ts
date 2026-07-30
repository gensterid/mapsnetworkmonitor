import { OltDriverConfig, IOltDriver } from './olt-driver.interface.js';
import { HsgqDriver } from './hsgq.driver.js';
import { CDataDriver } from './cdata.driver.js';
import { GenericDriver } from './generic.driver.js';
import { DummyOltDriver } from './dummy.driver.js';
import { decrypt } from '../../lib/encryption.js';
import { logger } from '../../lib/logger.js';
import { CDataProvisioningDriver } from './cdata-provisioning.driver.js';
import { IOltProvisioningDriver, ProvisioningNotSupportedError } from './olt-provisioning.interface.js';

export class OltDriverFactory {
    static getDriver(type: string, host: string, port?: number, username?: string, password?: string, protocol?: string): IOltDriver {
        let decryptedPassword = password || '';
        while (decryptedPassword && decryptedPassword.includes(':') && decryptedPassword.split(':').length === 4) {
            try {
                decryptedPassword = decrypt(decryptedPassword);
            } catch (e) {
                logger.error({ err: e }, 'Failed to decrypt OLT password layer');
                break;
            }
        }

        const config: OltDriverConfig = {
            host,
            port: port || (protocol === 'https' ? 443 : 80),
            protocol: (protocol as any) || 'http',
            username,
            password: decryptedPassword,
        };

        if (config.protocol === 'telnet' || config.protocol === 'ssh') {
            logger.warn({ host }, '[DriverFactory] Telnet/SSH is disabled. Falling back to HTTP');
            config.protocol = 'http';
            config.port = port || 80;
        }

        switch (type.toLowerCase()) {
            case 'hsgq':
                return new HsgqDriver(config);
            case 'cdata':
                return new CDataDriver(config);
            default:
                return new GenericDriver(config);
        }
    }

    /**
     * Driver PROVISIONING (Fase-1: authorize ONU di OLT). Terpisah dari
     * getDriver (read+reboot). Baru C-Data (Telnet); HSGQ butuh HAR, lain belum.
     */
    static getProvisioningDriver(type: string, config: OltDriverConfig): IOltProvisioningDriver {
        switch (type.toLowerCase()) {
            case 'cdata':
                return new CDataProvisioningDriver(config);
            default:
                throw new ProvisioningNotSupportedError('OltDriverFactory', `driver provisioning '${type}' belum tersedia`);
        }
    }
}
