-- Tambah jam mulai + jam akhir cek isolir per-router.
-- Default 08:00-17:00 supaya scheduler app + scheduler MikroTik tidak isolir
-- customer tengah malam. Operator boleh ubah ke window lain via UI.
ALTER TABLE "billing_router_settings"
    ADD COLUMN IF NOT EXISTS "isolir_check_start_hour" integer NOT NULL DEFAULT 8;

ALTER TABLE "billing_router_settings"
    ADD COLUMN IF NOT EXISTS "isolir_check_end_hour" integer NOT NULL DEFAULT 17;
