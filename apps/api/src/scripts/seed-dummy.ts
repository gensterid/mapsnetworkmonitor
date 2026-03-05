import 'dotenv/config';
import { db } from '../db/index.js';
import { routers, tenants, olts, onus, routerNetwatch } from '../db/schema/index.js';
import { logger } from '../lib/logger.js';
import { encrypt } from '../lib/encryption.js';

async function seedDummy() {
    logger.info('🌱 Seeding full dummy network for development...');

    try {
        // 1. Ensure Tenant exists
        let [tenant] = await db.select().from(tenants).limit(1);
        if (!tenant) {
            [tenant] = await db.insert(tenants).values({
                name: 'Default Tenant',
                slug: 'default',
            }).returning();
            logger.info({ tenantId: tenant.id }, '✅ Created default tenant');
        }

        const tenantId = tenant.id;

        // 2. Create Main Dummy Router
        const [router] = await db.insert(routers).values({
            tenantId,
            name: 'DUMMY-CORE-ROUTER',
            host: '10.0.0.1',
            username: 'admin',
            passwordEncrypted: encrypt('admin'),
            status: 'online',
            model: 'RB4011',
            useGenieAcs: true,
            genieacsUrl: 'http://10.0.0.30:7557',
            latitude: '-6.2088',
            longitude: '106.8456', // Jakarta Center
        }).returning();
        logger.info({ routerId: router.id }, '✅ Created dummy router');

        // 3. Create OLTs linked to Router
        const [oltCdata] = await db.insert(olts).values({
            tenantId,
            parentId: router.id,
            name: 'OLT-CDATA-MOCK',
            host: '10.0.0.10',
            webUsername: 'admin',
            webPassword: encrypt('admin'),
            type: 'cdata',
            status: 'online',
        }).returning();

        const [oltHsgq] = await db.insert(olts).values({
            tenantId,
            parentId: router.id,
            name: 'OLT-HSGQ-MOCK',
            host: '10.0.0.20',
            webUsername: 'admin',
            webPassword: encrypt('admin'),
            type: 'hsgq',
            status: 'online',
        }).returning();
        logger.info('✅ Created dummy OLTs');

        // 4. Create ONUs for OLTs
        const dummyOnus = [
            { sn: 'DMY-CDATA-0001', name: 'User-CData-1', oltId: oltCdata.id, lat: '-6.215', lng: '106.850' },
            { sn: 'DMY-CDATA-0002', name: 'User-CData-2', oltId: oltCdata.id, lat: '-6.220', lng: '106.855' },
            { sn: 'DMY-HSGQ-0001', name: 'User-HSGQ-1', oltId: oltHsgq.id, lat: '-6.200', lng: '106.840' },
            { sn: 'DMY-ACS-SN-001', name: 'User-ACS-Zte', routerId: router.id, lat: '-6.205', lng: '106.842' },
        ];

        for (const d of dummyOnus) {
            await db.insert(onus).values({
                tenantId,
                sn: d.sn,
                name: d.name,
                oltId: d.oltId || null,
                routerId: d.routerId || null,
                status: 'online',
                latitude: d.lat ? String(d.lat) : null,
                longitude: d.lng ? String(d.lng) : null,
                discoverySources: d.routerId ? ['acs'] : ['olt'],
            });
        }
        logger.info('✅ Created dummy ONUs');

        // 5. Create Netwatch entries with coordinates
        const netwatchData = [
            { host: '8.8.8.8', name: 'Google DNS', lat: '-6.175', lng: '106.827' },
            { host: '1.1.1.1', name: 'Cloudflare', lat: '-6.170', lng: '106.820' },
            { host: '10.0.0.10', name: 'OLT-CDATA-MOCK', lat: '-6.180', lng: '106.830' },
            { host: '10.0.0.20', name: 'OLT-HSGQ-MOCK', lat: '-6.185', lng: '106.835' },
        ];

        for (const n of netwatchData) {
            await db.insert(routerNetwatch).values({
                tenantId,
                routerId: router.id,
                host: n.host,
                name: n.name,
                status: 'up',
                latitude: String(n.lat),
                longitude: String(n.lng),
            } as any); // Type cast as fallback for netwatch naming issues if they persist
        }
        logger.info('✅ Created dummy Netwatch entries');

        logger.info('🎉 Full dummy seeding complete!');
        process.exit(0);
    } catch (err) {
        logger.error({ err }, '❌ Failed to seed dummy network');
        process.exit(1);
    }
}

seedDummy();
