ALTER TABLE "routers" ADD COLUMN "use_genieacs" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "routers" ADD COLUMN "genieacs_url" text;--> statement-breakpoint
ALTER TABLE "olts" ADD COLUMN "parent_id" uuid;--> statement-breakpoint
ALTER TABLE "olts" ADD COLUMN "active_protocol" text;