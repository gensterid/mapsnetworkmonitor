
import { OltDriverFactory } from './src/services/olt-drivers/driver.factory.js';
import pkg from './package.json' assert { type: 'json' };

async function test() {
    console.log('--- OLT Diagnostic Test ---');
    const type = process.argv[2] || 'hsgq';
    const host = process.argv[3] || '127.0.0.1';
    const user = process.argv[4] || 'admin';
    const pass = process.argv[5] || 'admin';

    console.log(`Testing ${type} at ${host} with user ${user}`);

    try {
        const driver = OltDriverFactory.getDriver(type, host, 23, user, pass);
        console.log('Driver instantiated. Connecting...');

        await driver.connect();
        console.log('Connected! Fetching ONUs...');

        const onus = await driver.getOnuList();
        console.log('ONUs found:', onus.length);
        console.log('Output preview:', JSON.stringify(onus[0]).substring(0, 100));

        await driver.disconnect();
        console.log('Disconnected safely.');
    } catch (error) {
        console.error('DIAGNOSTIC FAILED:');
        console.error(error);
    }
}

test();
