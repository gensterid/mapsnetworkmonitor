ALTER TABLE "routers" ADD COLUMN IF NOT EXISTS "use_webhook" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "routers" ADD COLUMN IF NOT EXISTS "webhook_secret" text;--> statement-breakpoint
ALTER TABLE "routers" ADD COLUMN IF NOT EXISTS "polling_interval_metrics" integer DEFAULT 300 NOT NULL;--> statement-breakpoint
ALTER TABLE "onus" ADD COLUMN IF NOT EXISTS "router_id" uuid;--> statement-breakpoint
ALTER TABLE "onus" ADD COLUMN IF NOT EXISTS "description" text;--> statement-breakpoint
DO $$ BEGIN
    ALTER TABLE "onus" ADD CONSTRAINT "onus_router_id_routers_id_fk" FOREIGN KEY ("router_id") REFERENCES "public"."routers"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "onus_router_id_idx" ON "onus" USING btree ("router_id");