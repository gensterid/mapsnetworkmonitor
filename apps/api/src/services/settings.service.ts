import { eq, desc, and } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
    appSettings,
    auditLogs,
    type AppSetting,
    type AuditLog,
    type NewAuditLog,
} from '../db/schema/index.js';
import { logger } from '../lib/logger.js';

/**
 * Settings Service - handles app settings and audit logs
 */
export class SettingsService {
    private cache: Map<string, { data: AppSetting; timestamp: number }> = new Map();
    private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes cache

    // Global fallback settings for all tenants (Infrastructure level)
    private readonly GLOBAL_FALLBACKS: Record<string, any> = {
        googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY || null,
        webhook_base_url: process.env.WEBHOOK_BASE_URL || 'http://localhost:5173',
        appName: 'NetMonitor'
    };

    /**
     * Get all settings
     */
    async findAllSettings(tenantId?: string): Promise<AppSetting[]> {
        const query = db.select().from(appSettings);
        if (tenantId) {
            query.where(eq(appSettings.tenantId, tenantId));
        }
        const dbSettings = await query;

        // If environment variable is set, it overrides ANY database value for webhook_base_url
        const hasEnvOverride = !!process.env.WEBHOOK_BASE_URL;
        
        // Filter out database records that are being overridden by environment
        const filteredDbSettings = hasEnvOverride 
            ? dbSettings.filter(s => s.key !== 'webhook_base_url')
            : dbSettings;

        const dbKeys = new Set(filteredDbSettings.map((s) => s.key));
        const merged = [...filteredDbSettings];

        // If no tenantId is provided (superadmin), use a dummy or first available for the virtual objects
        const effectiveTenantId = tenantId || '00000000-0000-0000-0000-000000000000';

        Object.entries(this.GLOBAL_FALLBACKS).forEach(([key, value]) => {
            if (!dbKeys.has(key) && value !== null) {
                merged.push({
                    id: '00000000-0000-0000-0000-000000000000' as any, // Virtual ID
                    tenantId: effectiveTenantId as any,
                    key,
                    value,
                    description: key === 'webhook_base_url' && hasEnvOverride ? 'System Environment Override' : 'Global Fallback Setting',
                    updatedAt: new Date(),
                });
            }
        });

        return merged;
    }

    /**
     * Get setting by key
     */
    async getSetting(key: string, tenantId: string): Promise<AppSetting | undefined> {
        // Check cache
        const cacheKey = `${tenantId}:${key}`;
        const cached = this.cache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
            return cached.data;
        }

        // Explicit Environment Overrides (Priority 1)
        if (key === 'webhook_base_url' && process.env.WEBHOOK_BASE_URL) {
            return {
                id: '00000000-0000-0000-0000-000000000000' as any,
                tenantId: tenantId as any,
                key,
                value: process.env.WEBHOOK_BASE_URL,
                description: 'System Environment Override',
                updatedAt: new Date()
            };
        }

        const [setting] = await db
            .select()
            .from(appSettings)
            .where(and(eq(appSettings.key, key), eq(appSettings.tenantId, tenantId)));

        if (setting) {
            this.cache.set(cacheKey, { data: setting, timestamp: Date.now() });
            return setting;
        }

        // Fallback to global defaults if not in DB
        if (this.GLOBAL_FALLBACKS[key] !== undefined && this.GLOBAL_FALLBACKS[key] !== null) {
            const fallback: AppSetting = {
                id: '00000000-0000-0000-0000-000000000000' as any,
                tenantId: tenantId as any,
                key,
                value: this.GLOBAL_FALLBACKS[key],
                description: 'Global Fallback Setting',
                updatedAt: new Date()
            };
            return fallback;
        }

        return undefined;
    }

    /**
     * Get setting value by key
     */
    async getSettingValue<T>(key: string, tenantId: string, defaultValue: T): Promise<T> {
        const setting = await this.getSetting(key, tenantId);
        return (setting?.value as T) ?? defaultValue;
    }

    /**
     * Set a setting
     */
    async setSetting(
        key: string,
        value: unknown,
        tenantId: string,
        description?: string
    ): Promise<AppSetting> {
        // Check if setting exists and is not a virtual fallback
        const existing = await this.getSetting(key, tenantId);
        const isVirtual = existing?.id === '00000000-0000-0000-0000-000000000000';
        let setting: AppSetting;

        if (existing && !isVirtual) {
            // Update existing real setting
            const [updated] = await db
                .update(appSettings)
                .set({ value, description, updatedAt: new Date() })
                .where(and(eq(appSettings.key, key), eq(appSettings.tenantId, tenantId)))
                .returning();
            setting = updated;
        } else {
            // Create new (if doesn't exist OR is just a fallback)
            const [created] = await db
                .insert(appSettings)
                .values({ key, value, description, tenantId })
                .returning();
            setting = created;
        }

        // Update cache
        if (setting) {
            this.cache.set(`${tenantId}:${key}`, { data: setting, timestamp: Date.now() });
        }

        return setting;
    }

    /**
     * Delete a setting
     */
    async deleteSetting(key: string, tenantId: string): Promise<boolean> {
        const result = await db
            .delete(appSettings)
            .where(and(eq(appSettings.key, key), eq(appSettings.tenantId, tenantId)))
            .returning();

        if (result.length > 0) {
            this.cache.delete(`${tenantId}:${key}`);
        }

        return result.length > 0;
    }

    /**
     * Create an audit log entry
     */
    async createAuditLog(data: NewAuditLog): Promise<AuditLog> {
        const [log] = await db.insert(auditLogs).values(data).returning();
        return log;
    }

    /**
     * Get audit logs
     */
    async getAuditLogs(tenantId?: string, limit = 100): Promise<AuditLog[]> {
        const filters = [];
        if (tenantId) {
            filters.push(eq(auditLogs.tenantId, tenantId));
        }

        return db
            .select()
            .from(auditLogs)
            .where(and(...filters))
            .orderBy(desc(auditLogs.createdAt))
            .limit(limit);
    }

    /**
     * Get audit logs by user
     */
    async getAuditLogsByUser(userId: string, limit = 100): Promise<AuditLog[]> {
        return db
            .select()
            .from(auditLogs)
            .where(eq(auditLogs.userId, userId))
            .orderBy(desc(auditLogs.createdAt))
            .limit(limit);
    }

    /**
     * Get audit logs by entity
     */
    async getAuditLogsByEntity(
        entity: string,
        entityId: string,
        tenantId?: string,
        limit = 100
    ): Promise<AuditLog[]> {
        const filters = [eq(auditLogs.entity, entity), eq(auditLogs.entityId, entityId)];
        if (tenantId) {
            filters.push(eq(auditLogs.tenantId, tenantId));
        }

        return db
            .select()
            .from(auditLogs)
            .where(and(...filters))
            .orderBy(desc(auditLogs.createdAt))
            .limit(limit);
    }

    /**
     * Log an action
     */
    async logAction(
        action: string,
        entity: string,
        entityId: string | null,
        userId: string | null,
        tenantId: string | null,
        details?: Record<string, unknown>,
        request?: { ip?: string; headers?: { 'user-agent'?: string } }
    ): Promise<AuditLog> {
        return this.createAuditLog({
            action,
            entity,
            entityId: entityId ?? undefined,
            userId: userId ?? undefined,
            tenantId: tenantId ?? undefined,
            details,
            ipAddress: request?.ip,
            userAgent: request?.headers?.['user-agent'],
        });
    }

    /**
     * Initialize default settings if they don't exist
     */
    async seedDefaults(tenantId: string): Promise<void> {
        const defaults = [
            { key: 'olt_polling_interval', value: 1, description: 'SNMP Polling Interval (OLT Status) in minutes' },
            { key: 'olt_web_interval', value: 10, description: 'Web API Polling Interval (ONU Detail Sync) in minutes' },
            { key: 'acs_polling_interval', value: 10, description: 'GenieACS Polling Interval in minutes' },
            { key: 'olt_sync_enabled', value: true, description: 'Enable OLT Polling' },
            { key: 'acs_sync_enabled', value: true, description: 'Enable GenieACS Sync' },
            { key: 'webhook_base_url', value: 'http://localhost:5173', description: 'Base URL for Webhooks (e.g. https://domain.com)' },
            { key: 'googleMapsApiKey', value: this.GLOBAL_FALLBACKS.googleMapsApiKey, description: 'Google Maps API Key' }
        ];

        for (const setting of defaults) {
            const existing = await this.getSetting(setting.key, tenantId);
            const isVirtual = existing?.id === '00000000-0000-0000-0000-000000000000';

            if (!existing || isVirtual) {
                logger.info({ key: setting.key, tenantId }, 'Seeding default setting');
                await this.setSetting(setting.key, setting.value, tenantId, setting.description);
            }
        }
    }

    /**
     * Generate the full webhook URL for a given router secret
     */
    async getWebhookUrl(secret: string, tenantId: string): Promise<string> {
        const baseUrl = await this.getSettingValue<string>('webhook_base_url', tenantId, 'http://localhost:5173');
        // Remove trailing slash if exists
        const cleanBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
        return `${cleanBaseUrl}/api/webhook/netwatch?token=${secret}`;
    }
}

// Export singleton instance
export const settingsService = new SettingsService();
