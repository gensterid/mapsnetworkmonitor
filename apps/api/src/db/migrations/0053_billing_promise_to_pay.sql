-- Promise to Pay (Janji Bayar) — track operator's defer policy
-- Tujuan: kebijakan defer tidak hilang di kepala operator.

DO $$ BEGIN
    CREATE TYPE "billing_promise_status" AS ENUM ('pending', 'fulfilled', 'broken', 'cancelled');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Tambah tipe WA notif untuk reminder promise (H-1 dan H+0).
-- PostgreSQL: ALTER TYPE ADD VALUE bisa di-skip kalau sudah ada via IF NOT EXISTS (PG >=9.6 syntax works).
ALTER TYPE "billing_wa_notif_type" ADD VALUE IF NOT EXISTS 'promise_reminder_h1';
ALTER TYPE "billing_wa_notif_type" ADD VALUE IF NOT EXISTS 'promise_reminder_d0';

CREATE TABLE IF NOT EXISTS "billing_promise_to_pay" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
    "subscription_id" uuid NOT NULL REFERENCES "billing_subscriptions"("id") ON DELETE CASCADE,
    "invoice_id" uuid NOT NULL REFERENCES "billing_invoices"("id") ON DELETE CASCADE,
    "promised_for" timestamp NOT NULL,
    "notes" text,
    "auto_isolir_if_broken" boolean NOT NULL DEFAULT false,
    "status" "billing_promise_status" NOT NULL DEFAULT 'pending',
    "created_by" uuid REFERENCES "users"("id") ON DELETE SET NULL,
    "resolved_at" timestamp,
    "reminder_h_minus_1_sent_at" timestamp,
    "reminder_h_zero_sent_at" timestamp,
    "created_at" timestamp NOT NULL DEFAULT now(),
    "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "billing_promise_tenant_idx" ON "billing_promise_to_pay" ("tenant_id");
CREATE INDEX IF NOT EXISTS "billing_promise_subscription_idx" ON "billing_promise_to_pay" ("subscription_id");
CREATE INDEX IF NOT EXISTS "billing_promise_invoice_idx" ON "billing_promise_to_pay" ("invoice_id");
CREATE INDEX IF NOT EXISTS "billing_promise_status_idx" ON "billing_promise_to_pay" ("status");
CREATE INDEX IF NOT EXISTS "billing_promise_promised_for_idx" ON "billing_promise_to_pay" ("promised_for");
