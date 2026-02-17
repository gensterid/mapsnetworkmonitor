ALTER TABLE "routers" ADD COLUMN IF NOT EXISTS "use_genieacs" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "routers" ADD COLUMN IF NOT EXISTS "genieacs_url" text;--> statement-breakpoint
ALTER TABLE "olts" ADD COLUMN IF NOT EXISTS "parent_id" uuid;--> statement-breakpoint
ALTER TABLE "olts" ADD COLUMN IF NOT EXISTS "active_protocol" text;