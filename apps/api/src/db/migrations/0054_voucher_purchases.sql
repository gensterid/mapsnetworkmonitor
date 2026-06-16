-- Voucher online purchase tracking. Customer beli voucher hotspot via halaman
-- publik + payment gateway. Lifecycle: pending → paid → fulfilled.

DO $$ BEGIN
    CREATE TYPE "billing_voucher_purchase_status" AS ENUM ('pending', 'paid', 'fulfilled', 'failed', 'expired');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "billing_voucher_purchases" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
    "router_id" uuid NOT NULL REFERENCES "routers"("id") ON DELETE CASCADE,
    "package_id" uuid NOT NULL REFERENCES "billing_packages"("id") ON DELETE RESTRICT,
    "invoice_id" uuid NOT NULL REFERENCES "billing_invoices"("id") ON DELETE CASCADE,
    "voucher_id" uuid REFERENCES "billing_vouchers"("id") ON DELETE SET NULL,
    "access_token" text NOT NULL,
    "buyer_phone" text,
    "status" "billing_voucher_purchase_status" NOT NULL DEFAULT 'pending',
    "paid_at" timestamp,
    "fulfilled_at" timestamp,
    "error_message" text,
    "created_at" timestamp NOT NULL DEFAULT now(),
    "updated_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "billing_vp_tenant_idx" ON "billing_voucher_purchases" ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "billing_vp_router_idx" ON "billing_voucher_purchases" ("router_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "billing_vp_invoice_idx" ON "billing_voucher_purchases" ("invoice_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "billing_vp_status_idx" ON "billing_voucher_purchases" ("status");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "billing_vp_access_token_unq" ON "billing_voucher_purchases" ("access_token");
