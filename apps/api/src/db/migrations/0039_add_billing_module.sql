DO $$ BEGIN
 CREATE TYPE "billing_package_type" AS ENUM('pppoe', 'hotspot');
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "billing_cycle_type" AS ENUM('monthly', 'duration');
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "billing_subscription_status" AS ENUM('active', 'isolir', 'expired', 'cancelled', 'suspended');
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "billing_invoice_status" AS ENUM('unpaid', 'paid', 'overdue', 'cancelled');
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "billing_payment_method" AS ENUM('manual_cash', 'manual_transfer', 'gateway_tripay', 'gateway_midtrans', 'gateway_xendit');
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "billing_voucher_status" AS ENUM('unused', 'active', 'expired', 'cancelled');
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "billing_hotspot_mode" AS ENUM('native', 'mikhmon_bridge', 'disabled');
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "billing_wa_provider" AS ENUM('fonnte', 'wablas', 'webhook', 'none');
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "billing_wa_notif_type" AS ENUM('h_minus_1', 'due_day', 'overdue', 'isolir', 'voucher_expiry', 'payment_received', 'manual');
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "billing_wa_notif_status" AS ENUM('queued', 'sent', 'failed');
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "billing_packages" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
    "router_id" uuid REFERENCES "routers"("id") ON DELETE set null,
    "name" text NOT NULL,
    "type" "billing_package_type" NOT NULL,
    "mikrotik_profile" text NOT NULL,
    "price" numeric(14,2) DEFAULT '0' NOT NULL,
    "cycle_type" "billing_cycle_type" NOT NULL,
    "cycle_value" integer DEFAULT 1 NOT NULL,
    "description" text,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL,
    "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "billing_pkg_tenant_idx" ON "billing_packages" ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "billing_pkg_router_idx" ON "billing_packages" ("router_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "billing_pkg_type_idx" ON "billing_packages" ("type");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "billing_customers" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
    "code" text NOT NULL,
    "name" text NOT NULL,
    "phone" text,
    "email" text,
    "address" text,
    "latitude" numeric(10,7),
    "longitude" numeric(10,7),
    "pin_code" text,
    "notes" text,
    "active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL,
    "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "billing_cust_tenant_idx" ON "billing_customers" ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "billing_cust_tenant_code_unq" ON "billing_customers" ("tenant_id", "code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "billing_cust_phone_idx" ON "billing_customers" ("phone");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "billing_subscriptions" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
    "customer_id" uuid NOT NULL REFERENCES "billing_customers"("id") ON DELETE cascade,
    "package_id" uuid NOT NULL REFERENCES "billing_packages"("id") ON DELETE restrict,
    "router_id" uuid NOT NULL REFERENCES "routers"("id") ON DELETE cascade,
    "type" "billing_package_type" NOT NULL,
    "mikrotik_identity" text NOT NULL,
    "mikrotik_password_encrypted" text,
    "billing_day" integer,
    "activated_at" timestamp,
    "expires_at" timestamp,
    "status" "billing_subscription_status" DEFAULT 'active' NOT NULL,
    "status_reason" text,
    "next_due_at" timestamp,
    "last_invoiced_at" timestamp,
    "created_at" timestamp DEFAULT now() NOT NULL,
    "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "billing_sub_tenant_idx" ON "billing_subscriptions" ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "billing_sub_customer_idx" ON "billing_subscriptions" ("customer_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "billing_sub_router_idx" ON "billing_subscriptions" ("router_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "billing_sub_status_idx" ON "billing_subscriptions" ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "billing_sub_next_due_idx" ON "billing_subscriptions" ("next_due_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "billing_sub_expires_idx" ON "billing_subscriptions" ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "billing_sub_router_type_identity_unq" ON "billing_subscriptions" ("router_id", "type", "mikrotik_identity");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "billing_invoices" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
    "router_id" uuid REFERENCES "routers"("id") ON DELETE set null,
    "customer_id" uuid NOT NULL REFERENCES "billing_customers"("id") ON DELETE cascade,
    "subscription_id" uuid REFERENCES "billing_subscriptions"("id") ON DELETE set null,
    "package_id" uuid REFERENCES "billing_packages"("id") ON DELETE set null,
    "invoice_number" text NOT NULL,
    "period_start" timestamp,
    "period_end" timestamp,
    "amount" numeric(14,2) DEFAULT '0' NOT NULL,
    "status" "billing_invoice_status" DEFAULT 'unpaid' NOT NULL,
    "due_at" timestamp NOT NULL,
    "paid_at" timestamp,
    "notes" text,
    "created_at" timestamp DEFAULT now() NOT NULL,
    "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "billing_inv_tenant_idx" ON "billing_invoices" ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "billing_inv_customer_idx" ON "billing_invoices" ("customer_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "billing_inv_status_idx" ON "billing_invoices" ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "billing_inv_due_at_idx" ON "billing_invoices" ("due_at");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "billing_inv_tenant_number_unq" ON "billing_invoices" ("tenant_id", "invoice_number");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "billing_payments" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
    "invoice_id" uuid NOT NULL REFERENCES "billing_invoices"("id") ON DELETE cascade,
    "amount" numeric(14,2) NOT NULL,
    "method" "billing_payment_method" NOT NULL,
    "gateway_txn_id" text,
    "gateway_payload" jsonb,
    "recorded_by" text REFERENCES "users"("id") ON DELETE set null,
    "recorded_at" timestamp DEFAULT now() NOT NULL,
    "notes" text
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "billing_pay_tenant_idx" ON "billing_payments" ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "billing_pay_invoice_idx" ON "billing_payments" ("invoice_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "billing_pay_method_idx" ON "billing_payments" ("method");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "billing_pay_gateway_txn_unq" ON "billing_payments" ("method", "gateway_txn_id");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "billing_voucher_batches" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
    "router_id" uuid NOT NULL REFERENCES "routers"("id") ON DELETE cascade,
    "package_id" uuid NOT NULL REFERENCES "billing_packages"("id") ON DELETE restrict,
    "count" integer NOT NULL,
    "prefix" text,
    "notes" text,
    "generated_by" text REFERENCES "users"("id") ON DELETE set null,
    "generated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "billing_vb_tenant_idx" ON "billing_voucher_batches" ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "billing_vb_router_idx" ON "billing_voucher_batches" ("router_id");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "billing_vouchers" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
    "router_id" uuid NOT NULL REFERENCES "routers"("id") ON DELETE cascade,
    "package_id" uuid NOT NULL REFERENCES "billing_packages"("id") ON DELETE restrict,
    "batch_id" uuid REFERENCES "billing_voucher_batches"("id") ON DELETE set null,
    "code" text NOT NULL,
    "pin_code" text,
    "profile" text NOT NULL,
    "price" numeric(14,2) DEFAULT '0' NOT NULL,
    "printed_at" timestamp,
    "redeemed_at" timestamp,
    "expires_at" timestamp,
    "status" "billing_voucher_status" DEFAULT 'unused' NOT NULL,
    "created_at" timestamp DEFAULT now() NOT NULL,
    "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "billing_v_tenant_idx" ON "billing_vouchers" ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "billing_v_router_idx" ON "billing_vouchers" ("router_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "billing_v_batch_idx" ON "billing_vouchers" ("batch_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "billing_v_status_idx" ON "billing_vouchers" ("status");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "billing_v_router_code_unq" ON "billing_vouchers" ("router_id", "code");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "billing_router_settings" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
    "router_id" uuid NOT NULL REFERENCES "routers"("id") ON DELETE cascade,
    "pppoe_billing_enabled" boolean DEFAULT false NOT NULL,
    "hotspot_mode" "billing_hotspot_mode" DEFAULT 'disabled' NOT NULL,
    "isolir_profile" text DEFAULT 'pppoe-isolir',
    "isolir_redirect_url" text,
    "isolir_grace_days" integer DEFAULT 0 NOT NULL,
    "default_billing_day" integer DEFAULT 1 NOT NULL,
    "wa_provider" "billing_wa_provider" DEFAULT 'none' NOT NULL,
    "wa_config" jsonb,
    "wa_notif_h_minus_1_enabled" boolean DEFAULT true NOT NULL,
    "wa_notif_due_day_enabled" boolean DEFAULT true NOT NULL,
    "wa_notif_overdue_enabled" boolean DEFAULT true NOT NULL,
    "wa_notif_isolir_enabled" boolean DEFAULT true NOT NULL,
    "gateway_tripay_enabled" boolean DEFAULT false NOT NULL,
    "gateway_midtrans_enabled" boolean DEFAULT false NOT NULL,
    "gateway_xendit_enabled" boolean DEFAULT false NOT NULL,
    "gateway_config" jsonb,
    "invoice_footer_text" text,
    "voucher_template" text DEFAULT 'default',
    "created_at" timestamp DEFAULT now() NOT NULL,
    "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "billing_rs_tenant_idx" ON "billing_router_settings" ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "billing_rs_router_unq" ON "billing_router_settings" ("router_id");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "billing_wa_notifications_log" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE cascade,
    "router_id" uuid REFERENCES "routers"("id") ON DELETE set null,
    "customer_id" uuid REFERENCES "billing_customers"("id") ON DELETE set null,
    "subscription_id" uuid REFERENCES "billing_subscriptions"("id") ON DELETE set null,
    "invoice_id" uuid REFERENCES "billing_invoices"("id") ON DELETE set null,
    "voucher_id" uuid REFERENCES "billing_vouchers"("id") ON DELETE set null,
    "to_phone" text NOT NULL,
    "type" "billing_wa_notif_type" NOT NULL,
    "provider" "billing_wa_provider" NOT NULL,
    "status" "billing_wa_notif_status" DEFAULT 'queued' NOT NULL,
    "provider_response" jsonb,
    "error" text,
    "sent_at" timestamp,
    "created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "billing_wa_log_tenant_idx" ON "billing_wa_notifications_log" ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "billing_wa_log_customer_idx" ON "billing_wa_notifications_log" ("customer_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "billing_wa_log_invoice_idx" ON "billing_wa_notifications_log" ("invoice_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "billing_wa_log_status_idx" ON "billing_wa_notifications_log" ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "billing_wa_log_created_idx" ON "billing_wa_notifications_log" ("created_at");
