import 'dotenv/config';
import { db } from '../db/index.js';
import { users, accounts, tenants } from '../db/schema/index.js';
import { eq } from 'drizzle-orm';
import { scryptSync, randomBytes, randomUUID } from 'crypto';
import { logger } from '../lib/logger.js';

async function ensureAdmin() {
    const adminEmail = 'admin@mikrotik.local';
    const adminPassword = 'admin123';
    const adminName = 'Administrator';
    const tenantSlug = 'default';
    const tenantName = 'Default ISP';

    logger.info('Checking for default tenant and admin user...');

    try {
        // 1. Ensure Default Tenant exists
        let tenantId: string;
        const existingTenant = await db.select().from(tenants).where(eq(tenants.slug, tenantSlug)).limit(1);

        if (existingTenant.length === 0) {
            logger.info({ tenantSlug }, 'Creating default tenant...');
            const [newTenant] = await db.insert(tenants).values({
                id: randomUUID(),
                name: tenantName,
                slug: tenantSlug,
            }).returning();
            tenantId = newTenant.id;
            logger.info({ tenantId }, 'Default tenant created.');
        } else {
            tenantId = existingTenant[0].id;
            logger.info({ tenantId }, 'Default tenant already exists.');
        }

        // 2. Ensure Admin User exists
        const existingUser = await db.select().from(users).where(eq(users.email, adminEmail)).limit(1);

        if (existingUser.length === 0) {
            logger.info({ adminEmail }, 'Creating admin user...');

            const salt = randomBytes(16).toString('hex');
            const hashedBuffer = scryptSync(adminPassword, salt, 64, { N: 16384, r: 16, p: 1, maxmem: 67108864 });
            const hashedPassword = `${salt}:${hashedBuffer.toString('hex')}`;

            const now = new Date();
            const userId = randomUUID();

            const [newUser] = await db.insert(users).values({
                id: userId,
                email: adminEmail,
                name: adminName,
                role: 'superadmin',
                tenantId: tenantId,
                emailVerified: true,
                createdAt: now,
                updatedAt: now
            }).returning();

            await db.insert(accounts).values({
                id: randomUUID(),
                userId: newUser.id,
                accountId: newUser.email,
                providerId: 'credential',
                password: hashedPassword,
                createdAt: now,
                updatedAt: now
            });

            logger.info('✅ Admin user created successfully.');
        } else {
            // Update tenantId if missing
            if (!existingUser[0].tenantId) {
                await db.update(users).set({ tenantId: tenantId }).where(eq(users.id, existingUser[0].id));
                logger.info('Updated existing admin user with tenantId.');
            }
            logger.info('Admin user already exists.');
        }

    } catch (err: any) {
        logger.error({ err: err?.message || String(err) }, 'Error in ensure-admin script');
        process.exit(1);
    }

    process.exit(0);
}

ensureAdmin();
