import { OltDriverConfig, IOltDriver } from './olt-driver.interface.js';
import { HsgqDriver } from './hsgq.driver.js';
import { CDataDriver } from './cdata.driver.js';
import { GenericDriver } from './generic.driver.js';
import { decrypt } from '../../lib/encryption.js';

export class OltDriverFactory {
    static getDriver(type: string, host: string, port?: number, username?: string, password?: string, protocol?: string): IOltDriver {
        let decryptedPassword = password || '';
        while (decryptedPassword && decryptedPassword.includes(':') && decryptedPassword.split(':').length === 4) {
            try {
                decryptedPassword = decrypt(decryptedPassword);
            } catch (e) {
                console.error('Failed to decrypt OLT password layer:', e);
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
            console.warn(`[DriverFactory] Telnet/SSH is disabled. Falling back to HTTP for ${host}`);
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
}
