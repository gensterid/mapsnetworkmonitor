-- Global (non-tenant) system settings key-value store.
-- First use case: feature_flags controlled by superadmin to hide optional
-- features from admin/operator/user across all tenants.

CREATE TABLE IF NOT EXISTS "system_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"updated_by" text
);
