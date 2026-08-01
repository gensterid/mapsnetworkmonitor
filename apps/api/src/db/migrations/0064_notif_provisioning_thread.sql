-- Topic/thread Telegram terpisah untuk notifikasi provisioning/konfigurasi ONT
-- (dipisah dari topic alert). Null → fallback ke telegram_thread_id (topic alert).
ALTER TABLE "notification_groups" ADD COLUMN IF NOT EXISTS "telegram_provisioning_thread_id" text;
