import { db } from './db/index.js';
import { routers } from './db/schema/index.js';
import { eq } from 'drizzle-orm';

async function main() {
    const routerId = '35151eb9-e512-4b63-a29b-b725a729bca4';
    const router = await db.query.routers.findFirst({
        where: eq(routers.id, routerId)
    });

    if (router) {
        console.log(`Router: ${router.name}`);
        console.log(`Host: ${router.host}`);
        console.log(`SNMP Community: ${router.snmpCommunity}`);
        console.log(`SNMP Port: ${router.snmpPort}`);
    } else {
        console.log('Router not found');
    }
}

main();
