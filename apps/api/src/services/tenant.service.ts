import { db } from '../db/index.js';
import { tenants } from '../db/schema/index.js';
import { eq, desc } from 'drizzle-orm';
import { logger } from '../lib/logger.js';

export class TenantService {
    private static instance: TenantService;

    private constructor() { }

    public static getInstance(): TenantService {
        if (!TenantService.instance) {
            TenantService.instance = new TenantService();
        }
        return TenantService.instance;
    }

    /**
     * Find all tenants
     */
    async findAll() {
        return await db.select().from(tenants).orderBy(desc(tenants.createdAt));
    }

    /**
     * Find tenant by ID
     */
    async findById(id: string) {
        const [tenant] = await db.select().from(tenants).where(eq(tenants.id, id));
        return tenant;
    }

    /**
     * Create a new tenant
     */
    async create(data: { name: string; slug: string; description?: string; settings?: string }) {
        const [newTenant] = await db.insert(tenants).values({
            name: data.name,
            slug: data.slug,
            description: data.description,
            settings: data.settings,
        }).returning();

        logger.info({ tenantId: newTenant.id, slug: newTenant.slug }, 'Tenant created');
        return newTenant;
    }

    /**
     * Update a tenant
     */
    async update(id: string, data: Partial<{ name: string; slug: string; description: string; settings: string }>) {
        const [updatedTenant] = await db.update(tenants)
            .set({
                ...data,
                updatedAt: new Date(),
            })
            .where(eq(tenants.id, id))
            .returning();

        if (updatedTenant) {
            logger.info({ tenantId: id }, 'Tenant updated');
        }
        return updatedTenant;
    }

    /**
     * Delete a tenant
     */
    async delete(id: string) {
        const result = await db.delete(tenants).where(eq(tenants.id, id)).returning();
        if (result.length > 0) {
            logger.info({ tenantId: id }, 'Tenant deleted');
            return true;
        }
        return false;
    }
}

export const tenantService = TenantService.getInstance();
