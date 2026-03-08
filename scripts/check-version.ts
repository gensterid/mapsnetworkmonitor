import { connectToRouter } from '../apps/api/src/lib/mikrotik-api.js';
import { decrypt } from '../apps/api/src/lib/encryption.js';

async function checkVersion() {
    try {
        const conn = await connectToRouter({
            host: '10.10.70.53', // From user error
            port: 8728,
            username: 'zavatar', // From user logs
            password: '...' // I don't have it, but maybe I can fetch from DB if I fix the DB link
        });
        // ...
    } catch (e) {}
}
