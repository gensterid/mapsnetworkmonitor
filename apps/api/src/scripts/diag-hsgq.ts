import { OltDriverFactory } from '../services/olt-drivers/driver.factory.js';
import { logger } from '../lib/logger.js';

// Get args: host port username password
const args = process.argv.slice(2);
if (args.length < 4) {
    console.log("Usage: node diag-hsgq.ts <host> <port> <username> <password>");
    process.exit(1);
}

const [host, port, username, password] = args;

async function runDiag() {
    console.log(`\n=== Starting HSGQ Diagnostic ===`);
    console.log(`Target: http://${host}:${port}`);
    console.log(`User: ${username}`);
    
    try {
        const driver = OltDriverFactory.getDriver('hsgq', host, parseInt(port), username, password, 'http');
        
        console.log("\n1. Testing Connection...");
        await driver.connect();
        console.log("-> Connect successful!");
        
        console.log("\n2. Fetching ONUs...");
        const onus = await driver.getOnuList();
        console.log(`-> Success! Found ${onus.length} ONUs.`);
        
        if (onus.length > 0) {
            console.log("Sample ONU:");
            console.log(JSON.stringify(onus[0], null, 2));
        }

        await driver.disconnect();
    } catch (err: any) {
        console.error("\n❌ DIAGNOSTIC FAILED!");
        console.error(err.message);
        if (err.cause) console.error("Cause:", err.cause);
    }
}

runDiag().catch(console.error);
