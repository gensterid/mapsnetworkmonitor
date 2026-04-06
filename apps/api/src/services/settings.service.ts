import { eq, desc, and, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import {
    type AppSetting,
    type AuditLog,
    type NewAuditLog,
} from '../db/schema/index.js';
import { logger } from '../lib/logger.js';
import { settingRepository } from '../repositories/setting.repository.js';
import { auditRepository } from '../repositories/audit.repository.js';
import { type Result, ok, err } from '../lib/result.js';

/**
 * Settings Service - handles app settings and audit logs
 */
export class SettingsService {
    // Global fallback settings for all tenants (Infrastructure level)
    private readonly GLOBAL_FALLBACKS: Record<string, any> = {
        googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY || null,
        webhook_base_url: process.env.WEBHOOK_BASE_URL || 'http://localhost:5173',
        appName: 'NetMonitor',
        genieacs_url: process.env.GENIEACS_URL || 'http://localhost:7557',
        genieacs_username: '',
        genieacs_password_encrypted: '',
        performance_retention_days: 30
    };

    /**
     * Get all settings
     */
    async findAllSettings(tenantId?: string): Promise<AppSetting[]> {
        const dbSettings = tenantId 
            ? await settingRepository.findAll(tenantId)
            : await settingRepository.findAllGlobal();

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
        if (!tenantId) {
            if (this.GLOBAL_FALLBACKS[key] !== undefined && this.GLOBAL_FALLBACKS[key] !== null) {
                return {
                    id: '00000000-0000-0000-0000-000000000000' as any,
                    tenantId: '00000000-0000-0000-0000-000000000000' as any,
                    key,
                    value: this.GLOBAL_FALLBACKS[key],
                    description: 'Global Fallback Setting',
                    updatedAt: new Date()
                };
            }
            return undefined;
        }

        // Get from repository (which handles caching)
        const setting = await settingRepository.findByKey(tenantId, key);

        if (setting) {
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
    ): Promise<Result<AppSetting>> {
        if (!tenantId) {
            return err(new Error(`Cannot set setting "${key}": tenantId is required.`));
        }

        try {
            const setting = await settingRepository.upsert({
                key,
                value,
                tenantId,
                description
            });
            return ok(setting);
        } catch (error) {
            logger.error({ key, tenantId, err: error }, '[Settings] Failed to set setting');
            return err(error as Error);
        }
    }

    /**
     * Delete a setting
     */
    async deleteSetting(key: string, tenantId: string): Promise<boolean> {
        return settingRepository.delete(tenantId, key);
    }

    /**
     * Create an audit log entry
     */
    async createAuditLog(data: NewAuditLog): Promise<AuditLog> {
        return auditRepository.create(data);
    }

    /**
     * Get audit logs
     */
    async getAuditLogs(tenantId?: string, limit = 100): Promise<AuditLog[]> {
        return auditRepository.findAll({ tenantId, limit });
    }

    /**
     * Get audit logs by user
     */
    async getAuditLogsByUser(userId: string, limit = 100): Promise<AuditLog[]> {
        return auditRepository.findAll({ userId, limit });
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
        return auditRepository.findAll({ entity, entityId, tenantId, limit });
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
            { key: 'googleMapsApiKey', value: this.GLOBAL_FALLBACKS.googleMapsApiKey, description: 'Google Maps API Key' },
            { key: 'genieacs_url', value: 'http://localhost:7557', description: 'Global GenieACS URL' },
            { key: 'genieacs_username', value: '', description: 'Global GenieACS Username' },
            { key: 'genieacs_password_encrypted', value: '', description: 'Global GenieACS Password (Encrypted)' },
            { key: 'metrics_retention_days', value: 360, description: 'Retention period for device metrics (days)' },
            { key: 'interface_metrics_retention_days', value: 360, description: 'Retention period for interface traffic metrics (days)' },
            { key: 'alerts_retention_days', value: 60, description: 'Retention period for resolved alerts (days)' },
            { key: 'audit_logs_retention_days', value: 365, description: 'Retention period for system audit logs (days)' },
            { key: 'performance_retention_days', value: 30, description: 'Retention period for latency and signal history (days)' }
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

    /**
     * Get Database Usage Statistics
     * Returns table names, sizes, and row counts
     */
    async getDatabaseStats(): Promise<any[]> {
        try {
            const res = await db.execute(sql`
                SELECT 
                    relname AS table_name, 
                    pg_size_pretty(pg_total_relation_size(relid)) AS total_size,
                    pg_size_pretty(pg_relation_size(relid)) AS table_size,
                    pg_size_pretty(pg_total_relation_size(relid) - pg_relation_size(relid)) AS index_size,
                    n_live_tup AS row_count
                FROM pg_catalog.pg_stat_user_tables 
                WHERE schemaname = 'public'
                ORDER BY pg_total_relation_size(relid) DESC;
            `);
            return res;
        } catch (error) {
            logger.error({ err: error }, '[Settings] Failed to get database stats');
            return [];
        }
    }
}

// Export singleton instance
export const settingsService = new SettingsService();
