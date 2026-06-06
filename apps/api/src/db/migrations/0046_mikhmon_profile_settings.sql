-- Phase A10.1: mikhmon_profile_settings
--
-- Stores per-router per-profile metadata that MikHMON external keeps in
-- its own browser localStorage: voucher price (Rp) and validity duration
-- (RouterOS time string). Used by the MikHMON Console Reports tab to
-- compute sales, and by the Script Wizard to bake validity into the
-- generated on-login script.
--
-- Scoped per (router_id, profile_name) so the same profile name on
-- different routers can have different price/validity.

CREATE TABLE IF NOT EXISTS "mikhmon_profile_settings" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "tenant_id" uuid NOT NULL,
    "router_id" uuid NOT NULL REFERENCES "routers"("id") ON DELETE CASCADE,
    "profile_name" text NOT NULL,
    "price" numeric(14, 2) NOT NULL DEFAULT 0,
    "validity" text,                       -- e.g. "1h", "1d", "7d", "30d"
    "lock_user" boolean NOT NULL DEFAULT false,
    "shared_users" integer NOT NULL DEFAULT 1,
    "scripts_installed" boolean NOT NULL DEFAULT false,
    "scripts_installed_at" timestamp,
    "created_at" timestamp NOT NULL DEFAULT now(),
    "updated_at" timestamp NOT NULL DEFAULT now(),
    CONSTRAINT "mikhmon_ps_router_profile_unq" UNIQUE ("router_id", "profile_name")
);

CREATE INDEX IF NOT EXISTS "mikhmon_ps_tenant_idx" ON "mikhmon_profile_settings" ("tenant_id");
CREATE INDEX IF NOT EXISTS "mikhmon_ps_router_idx" ON "mikhmon_profile_settings" ("router_id");
