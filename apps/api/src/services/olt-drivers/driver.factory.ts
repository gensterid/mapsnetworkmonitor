import { OltDriverConfig, IOltDriver } from './olt-driver.interface.js';
import { HsgqDriver } from './hsgq.driver.js';
import { CDataDriver } from './cdata.driver.js';
import { GenericDriver } from './generic.driver.js';
import { decrypt } from '../../lib/encryption.js';

export class OltDriverFactory {
    static getDriver(type: string, host: string, port?: number, username?: string, password?: string): IOltDriver {
        let decryptedPassword = password;
        if (password && password.includes(':')) {
            try {
                decryptedPassword = decrypt(password);
            } catch (e) {
                console.error('Failed to decrypt OLT password:', e);
            }
        }

        const config: OltDriverConfig = {
            host,
            port: port || 23,
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
