import { eq, and, desc, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { appSettings, type AppSetting, type NewAppSetting } from '../db/schema/index.js';
import { cacheService } from '../lib/cache.js';

/**
 * Setting Repository - handles CRUD operations for application settings.
 * Integrates with cacheService for high-performance configuration management.
 */
export class SettingRepository {
    private static instance: SettingRepository;
    private readonly CACHE_PREFIX = 'setting:';

    private constructor() {}

    public static getInstance(): SettingRepository {
        if (!SettingRepository.instance) {
            SettingRepository.instance = new SettingRepository();
        }
        return SettingRepository.instance;
    }

    private getCacheKey(tenantId: string, key: string): string {
        return `${this.CACHE_PREFIX}${tenantId}:${key}`;
    }

    /**
     * Find setting by key for a tenant (leveraging cache)
     */
    async findByKey(tenantId: string, key: string, tx: any = db): Promise<AppSetting | undefined> {
        const cacheKey = this.getCacheKey(tenantId, key);
        const cached = await cacheService.get<AppSetting>(cacheKey);
        if (cached) return cached;

        const [setting] = await tx
            .select()
            .from(appSettings)
            .where(and(eq(appSettings.tenantId, tenantId), eq(appSettings.key, key)));

        if (setting) {
            await cacheService.set(cacheKey, setting, 3600); // 1 hour TTL for settings
        }

        return setting;
    }

    /**
     * Find all settings for a tenant
     */
    async findAll(tenantId: string, tx: any = db): Promise<AppSetting[]> {
        return tx
            .select()
            .from(appSettings)
            .where(eq(appSettings.tenantId, tenantId));
    }

    /**
     * Find all settings for all tenants (Superadmin view)
     */
    async findAllGlobal(tx: any = db): Promise<AppSetting[]> {
        return tx.select().from(appSettings);
    }

    /**
     * Upsert a setting (Update if exists, Insert if not)
     */
    async upsert(data: NewAppSetting, tx: any = db): Promise<AppSetting> {
        const [inserted] = await tx
            .insert(appSettings)
            .values(data)
            .onConflictDoUpdate({
                target: [appSettings.tenantId, appSettings.key],
                set: {
                    value: data.value,
                    description: data.description,
                    updatedAt: new Date(),
                },
            })
            .returning();

        if (inserted) {
            const cacheKey = this.getCacheKey(inserted.tenantId, inserted.key);
            await cacheService.set(cacheKey, inserted, 3600);
        }

        return inserted;
    }

    /**
     * Delete a setting
     */
    async delete(tenantId: string, key: string, tx: any = db): Promise<boolean> {
        const result = await tx
            .delete(appSettings)
            .where(and(eq(appSettings.tenantId, tenantId), eq(appSettings.key, key)))
            .returning({ id: appSettings.id });

        if (result.length > 0) {
            await cacheService.delete(this.getCacheKey(tenantId, key));
        }

        return result.length > 0;
    }

    /**
     * Find first setting by key (regardless of tenant, used for discovery)
     */
    async findFirstByKey(key: string, tx: any = db): Promise<AppSetting | undefined> {
        const [setting] = await tx
            .select()
            .from(appSettings)
            .where(eq(appSettings.key, key))
            .limit(1);
        return setting;
    }

    /**
     * Invalidate specific setting cache
     */
    async invalidateCache(tenantId: string, key: string): Promise<void> {
        await cacheService.delete(this.getCacheKey(tenantId, key));
    }
}

export const settingRepository = SettingRepository.getInstance();
