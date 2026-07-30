-- Fase-1: preset provisioning ONU di OLT (authorize + service). Tenant-scoped.
-- Beda dari `presets` (WAN/WiFi ONT / Fase-2). Secret disimpan terenkripsi.

DO $$ BEGIN
    CREATE TYPE "public"."provisioning_wan_mode" AS ENUM('bridge', 'pppoe', 'dhcp');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "provisioning_presets" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" uuid REFERENCES "tenants"("id"),
    "name" text NOT NULL,
    "description" text,
    "olt_type" "olt_type",
    "olt_id" uuid REFERENCES "olts"("id"),
    "onu_type_profile" text,
    "line_profile" text,
    "service_profile" text,
    "service_vlan" integer NOT NULL,
    "mgmt_vlan" integer,
    "acs_url" text,
    "acs_username" text,
    "acs_password_encrypted" text,
    "inform_interval" integer,
    "wan_mode" "provisioning_wan_mode" DEFAULT 'bridge' NOT NULL,
    "pppoe_username" text,
    "pppoe_password_encrypted" text,
    "created_at" timestamp DEFAULT now() NOT NULL,
    "updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "provisioning_presets_tenant_id_idx" ON "provisioning_presets" ("tenant_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "provisioning_presets_olt_id_idx" ON "provisioning_presets" ("olt_id");
