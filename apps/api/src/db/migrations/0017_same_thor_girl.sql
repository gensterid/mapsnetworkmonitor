DO $$ BEGIN
    ALTER TABLE "onus" DROP CONSTRAINT "onus_olt_id_olts_id_fk";
EXCEPTION
    WHEN undefined_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "onus" ALTER COLUMN "olt_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "router_netwatch" ADD COLUMN IF NOT EXISTS "linked_onu_id" uuid;--> statement-breakpoint
ALTER TABLE "onus" ADD COLUMN IF NOT EXISTS "model" text;--> statement-breakpoint
ALTER TABLE "onus" ADD COLUMN IF NOT EXISTS "ssid" text;--> statement-breakpoint
ALTER TABLE "onus" ADD COLUMN IF NOT EXISTS "firmware_version" text;--> statement-breakpoint
ALTER TABLE "onus" ADD COLUMN IF NOT EXISTS "last_down_reason" text;--> statement-breakpoint
ALTER TABLE "onus" ADD COLUMN IF NOT EXISTS "connection_type" text DEFAULT 'router';--> statement-breakpoint
ALTER TABLE "onus" ADD COLUMN IF NOT EXISTS "connected_to_id" uuid;--> statement-breakpoint
ALTER TABLE "onus" ADD COLUMN IF NOT EXISTS "waypoints" text;--> statement-breakpoint
ALTER TABLE "onus" ADD COLUMN IF NOT EXISTS "target_interface" text;--> statement-breakpoint
DO $$ BEGIN
    ALTER TABLE "onus" ADD CONSTRAINT "onus_olt_id_olts_id_fk" FOREIGN KEY ("olt_id") REFERENCES "public"."olts"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;