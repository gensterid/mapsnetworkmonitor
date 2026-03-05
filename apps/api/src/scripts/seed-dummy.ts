import 'dotenv/config';
import { db } from '../db/index.js';
import { routers, tenants } from '../db/schema/index.js';
import { eq } from 'drizzle-orm';
import { logger } from '../lib/logger.js';

async function seedDummy() {
    logger.info('🌱 Seeding dummy router for development...');

    try {
        const dummyHost = '1.1.1.1';

        // 1. Get a valid tenantId (dynamically)
        let tenantId: string;
        const [existingTenant] = await db.select().from(tenants).limit(1);

        if (existingTenant) {
            tenantId = existingTenant.id;
            logger.debug({ tenantName: existingTenant.name }, 'Using existing tenant for dummy router');
        } else {
            // Create a default tenant if none exists
            logger.info('Creating default tenant for dummy mode...');
            const [newTenant] = await db.insert(tenants).values({
                name: 'Default Development ISP',
                slug: 'default-isp',
                description: 'Auto-generated for dummy testing',
            }).returning();
            tenantId = newTenant.id;
        }

        // 2. Check if dummy already exists
        const [existing] = await db.select().from(routers).where(eq(routers.host, dummyHost));

        if (existing) {
            logger.info({ host: dummyHost }, '✅ Dummy router already exists. Skipping.');
            process.exit(0);
        }

        // 3. Add dummy router
        await db.insert(routers).values({
            name: 'Dummy Development Router',
            host: dummyHost,
            port: 8728,
            username: 'admin',
            passwordEncrypted: '', // Mock doesn't care
            status: 'online',
            tenantId: tenantId
        });

        logger.info('🚀 Dummy router added successfully! Make sure USE_DUMMY_DATA=true is set in your .env');
        process.exit(0);
    } catch (err: any) {
        logger.error({ err: err?.message || String(err) }, '❌ Failed to seed dummy router');
        process.exit(1);
    }
}

seedDummy();
