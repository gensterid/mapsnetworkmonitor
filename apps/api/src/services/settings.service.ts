import { eq, desc, and } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
    appSettings,
    auditLogs,
    type AppSetting,
    type AuditLog,
    type NewAuditLog,
} from '../db/schema/index.js';

/**
 * Settings Service - handles app settings and audit logs
 */
export class SettingsService {
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
        const [setting] = await db
            .select()
            .from(appSettings)
            .where(eq(appSettings.key, key));
        return setting;
    }

    /**
     * Get setting value by key
     */
    async getSettingValue<T>(key: string, defaultValue: T): Promise<T> {
        const setting = await this.getSetting(key);
        return setting?.value as T ?? defaultValue;
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

        if (existing) {
            // Update existing
            const [setting] = await db
                .update(appSettings)
                .set({ value, description, updatedAt: new Date() })
                .where(eq(appSettings.key, key))
                .returning();
            return setting;
        } else {
            // Create new
            const [setting] = await db
                .insert(appSettings)
                .values({ key, value, description })
                .returning();
            return setting;
        }
    }

    /**
     * Delete a setting
     */
    async deleteSetting(key: string): Promise<boolean> {
        const result = await db
            .delete(appSettings)
            .where(eq(appSettings.key, key))
            .returning();
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
}

// Export singleton instance
export const settingsService = new SettingsService();
