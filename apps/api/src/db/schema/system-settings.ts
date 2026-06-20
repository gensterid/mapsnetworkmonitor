import { pgTable, text, jsonb, timestamp } from 'drizzle-orm/pg-core';

/**
 * system_settings \xe2\x80\x94 GLOBAL key-value config (TIDAK per-tenant).
 *
 * Beda dengan `app_settings` yang scoped per-tenant. Tabel ini untuk config
 * level-sistem yang dikontrol superadmin dan berlaku ke SEMUA tenant.
 *
 * Use case pertama: `feature_flags` \xe2\x80\x94 superadmin matikan fitur tertentu
 * supaya tidak muncul untuk admin/operator/user di semua ISP. Superadmin
 * tetap melihat semua fitur (untuk manage/re-enable).
 *
 * Value disimpan sebagai JSONB untuk fleksibilitas (object/array/primitive).
 */
export const systemSettings = pgTable('system_settings', {
    key: text('key').primaryKey(),
    value: jsonb('value'),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    updatedBy: text('updated_by'), // userId superadmin yang terakhir ubah
});

export type SystemSetting = typeof systemSettings.$inferSelect;
export type NewSystemSetting = typeof systemSettings.$inferInsert;
