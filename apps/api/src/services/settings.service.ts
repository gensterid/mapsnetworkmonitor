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

    /**
     * Get all settings
     */
    async findAllSettings(): Promise<AppSetting[]> {
        return db.select().from(appSettings);
    }

    /**
     * Get setting by key
     */
    async getSetting(key: string): Promise<AppSetting | undefined> {
        // Check cache
        const cached = this.cache.get(key);
        if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
            return cached.data;
        }

        const [setting] = await db
            .select()
            .from(appSettings)
            .where(eq(appSettings.key, key));

        if (setting) {
            this.cache.set(key, { data: setting, timestamp: Date.now() });
        }

        return setting;
    }

    /**
     * Get setting value by key
     */
    async getSettingValue<T>(key: string, defaultValue: T): Promise<T> {
        const setting = await this.getSetting(key);
        return (setting?.value as T) ?? defaultValue;
    }

    /**
     * Set a setting
     */
    async setSetting(
        key: string,
        value: unknown,
        description?: string
    ): Promise<AppSetting> {
        // Check if setting exists
        const existing = await this.getSetting(key);
        let setting: AppSetting;

        if (existing) {
            // Update existing
            const [updated] = await db
                .update(appSettings)
                .set({ value, description, updatedAt: new Date() })
                .where(eq(appSettings.key, key))
                .returning();
            setting = updated;
        } else {
            // Create new
            const [created] = await db
                .insert(appSettings)
                .values({ key, value, description })
                .returning();
            setting = created;
        }

        // Update cache
        if (setting) {
            this.cache.set(key, { data: setting, timestamp: Date.now() });
        }

        return setting;
    }

    /**
     * Delete a setting
     */
    async deleteSetting(key: string): Promise<boolean> {
        const result = await db
            .delete(appSettings)
            .where(eq(appSettings.key, key))
            .returning();

        if (result.length > 0) {
            this.cache.delete(key);
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
    async getAuditLogs(limit = 100): Promise<AuditLog[]> {
        return db
            .select()
            .from(auditLogs)
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
        limit = 100
    ): Promise<AuditLog[]> {
        return db
            .select()
            .from(auditLogs)
            .where(and(eq(auditLogs.entity, entity), eq(auditLogs.entityId, entityId)))
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
        details?: Record<string, unknown>,
        request?: { ip?: string; headers?: { 'user-agent'?: string } }
    ): Promise<AuditLog> {
        return this.createAuditLog({
            action,
            entity,
            entityId: entityId ?? undefined,
            userId: userId ?? undefined,
            details,
            ipAddress: request?.ip,
            userAgent: request?.headers?.['user-agent'],
        });
    }

    /**
     * Initialize default settings if they don't exist
     */
    async seedDefaults(): Promise<void> {
        const defaults = [
            { key: 'olt_polling_interval', value: 1, description: 'SNMP Polling Interval (OLT Status) in minutes' },
            { key: 'olt_web_interval', value: 10, description: 'Web API Polling Interval (ONU Detail Sync) in minutes' },
            { key: 'acs_polling_interval', value: 10, description: 'GenieACS Polling Interval in minutes' },
            { key: 'olt_sync_enabled', value: true, description: 'Enable OLT Polling' },
            { key: 'acs_sync_enabled', value: true, description: 'Enable GenieACS Sync' }
        ];

        for (const setting of defaults) {
            const existing = await this.getSetting(setting.key);
            if (!existing) {
                logger.info({ key: setting.key }, 'Seeding default setting');
                await this.setSetting(setting.key, setting.value, setting.description);
            }
        }
    }
}

// Export singleton instance
export const settingsService = new SettingsService();
