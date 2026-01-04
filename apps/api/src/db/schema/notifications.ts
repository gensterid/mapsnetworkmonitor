import { pgTable, uuid, text, boolean, timestamp } from 'drizzle-orm/pg-core';

export const notificationGroups = pgTable('notification_groups', {
    id: uuid('id').defaultRandom().primaryKey(),
    name: text('name').notNull(),

    // Telegram
    telegramEnabled: boolean('telegram_enabled').default(false),
    telegramBotToken: text('telegram_bot_token'),
    telegramChatId: text('telegram_chat_id'),
    telegramThreadId: text('telegram_thread_id'), // For topic support

    // WhatsApp
    whatsappEnabled: boolean('whatsapp_enabled').default(false),
    whatsappUrl: text('whatsapp_url'), // Base URL for the WhatsApp API
    whatsappKey: text('whatsapp_key'), // API Key if needed
    whatsappTo: text('whatsapp_to'), // Target phone number/ID

    // Custom Message Template
    messageTemplate: text('message_template'), // Optional custom template

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export type NotificationGroup = typeof notificationGroups.$inferSelect;
export type NewNotificationGroup = typeof notificationGroups.$inferInsert;
