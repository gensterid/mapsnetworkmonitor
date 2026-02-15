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
            port: port || (protocol === 'telnet' ? 23 : (protocol === 'https' ? 443 : 80)),
            protocol: (protocol as any) || (port === 23 ? 'telnet' : 'http'),
            username,
            password: decryptedPassword,
        };

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
