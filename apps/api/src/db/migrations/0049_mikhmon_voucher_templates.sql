-- Phase A12: mikhmon_voucher_templates
--
-- Per-router voucher print template. Body uses Handlebars-style
-- {{variable}} placeholders so there's no PHP-eval-style code execution
-- when the template renders — substitution only.
--
-- One row per (router, name) lets operators have multiple named templates
-- in the future (e.g. "default", "small", "large"). For now Cetak Cepat
-- always picks the "default" template per router.

CREATE TABLE IF NOT EXISTS "mikhmon_voucher_templates" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
    "router_id" uuid NOT NULL REFERENCES "routers"("id") ON DELETE CASCADE,
    "name" text NOT NULL DEFAULT 'default',
    "body" text NOT NULL,
    "qr_enabled" boolean NOT NULL DEFAULT true,
    "logo_enabled" boolean NOT NULL DEFAULT true,
    "logo_filename" text,
    "created_at" timestamp NOT NULL DEFAULT now(),
    "updated_at" timestamp NOT NULL DEFAULT now(),
    CONSTRAINT "mikhmon_vt_router_name_unq" UNIQUE ("router_id", "name")
);

CREATE INDEX IF NOT EXISTS "mikhmon_vt_tenant_idx" ON "mikhmon_voucher_templates" ("tenant_id");
CREATE INDEX IF NOT EXISTS "mikhmon_vt_router_idx" ON "mikhmon_voucher_templates" ("router_id");
