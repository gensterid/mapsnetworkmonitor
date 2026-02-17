DO $$ BEGIN
    ALTER TYPE "public"."alert_type" ADD VALUE 'high_latency';
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
    ALTER TYPE "public"."alert_type" ADD VALUE 'packet_loss';
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "router_netwatch" ADD COLUMN IF NOT EXISTS "target_interface" text;