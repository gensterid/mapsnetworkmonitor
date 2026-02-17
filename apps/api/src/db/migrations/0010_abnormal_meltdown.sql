ALTER TYPE "public"."alert_type" ADD VALUE 'high_latency';--> statement-breakpoint
ALTER TYPE "public"."alert_type" ADD VALUE 'packet_loss';--> statement-breakpoint
ALTER TABLE "router_netwatch" ADD COLUMN IF NOT EXISTS "target_interface" text;