import 'dotenv/config';
import { db } from '../db/index.js';
import { routers } from '../db/schema/index.js';
import { eq } from 'drizzle-orm';
import { logger } from '../lib/logger.js';

async function seedDummy() {
    logger.info('🌱 Seeding dummy router for development...');

    try {
        const dummyHost = '1.1.1.1';

        // Check if dummy already exists
        const [existing] = await db.select().from(routers).where(eq(routers.host, dummyHost));

        if (existing) {
            logger.info({ host: dummyHost }, '✅ Dummy router already exists. Skipping.');
            process.exit(0);
        }

        // Add dummy router
        await db.insert(routers).values({
            name: 'Dummy Development Router',
            host: dummyHost,
            port: 8728,
            username: 'admin',
            passwordEncrypted: '', // Mock doesn't care
            status: 'online',
            tenantId: 'default-tenant' // Adjust if needed
        });

        logger.info('🚀 Dummy router added successfully! Make sure USE_DUMMY_DATA=true is set in your .env');
        process.exit(0);
    } catch (err: any) {
        logger.error({ err: err?.message || String(err) }, '❌ Failed to seed dummy router');
        process.exit(1);
    }
}

seedDummy();
