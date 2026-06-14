-- Dual billing mode: anchor_day (existing) vs anniversary (new).
-- Anchor_day = tagihan setiap tanggal X di bulan kalender (mis. 1, 13, 25).
-- Anniversary = tagihan tiap cycle_value bulan dari pembayaran terakhir
--               (mis. bayar 12 Mei → next 12 Jun, 12 Jul, dst.)

DO $$ BEGIN
    CREATE TYPE "billing_subscription_mode" AS ENUM ('anchor_day', 'anniversary');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

ALTER TABLE "billing_subscriptions"
    ADD COLUMN IF NOT EXISTS "billing_mode" "billing_subscription_mode" NOT NULL DEFAULT 'anchor_day';
