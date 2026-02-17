ALTER TYPE "public"."alert_type" ADD VALUE 'system';--> statement-breakpoint
ALTER TABLE "netwatch_hosts" ADD COLUMN IF NOT EXISTS "last_check" timestamp;--> statement-breakpoint
ALTER TABLE "netwatch_hosts" ADD COLUMN IF NOT EXISTS "last_up" timestamp;--> statement-breakpoint
ALTER TABLE "netwatch_hosts" ADD COLUMN IF NOT EXISTS "last_down" timestamp;--> statement-breakpoint
ALTER TABLE "netwatch_hosts" ADD COLUMN IF NOT EXISTS "latency" integer;--> statement-breakpoint
ALTER TABLE "netwatch_hosts" ADD COLUMN IF NOT EXISTS "last_known_latency" integer;--> statement-breakpoint
ALTER TABLE "netwatch_hosts" ADD COLUMN IF NOT EXISTS "packet_loss" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "netwatch_hosts" ADD COLUMN IF NOT EXISTS "latitude" numeric(10, 7);--> statement-breakpoint
ALTER TABLE "netwatch_hosts" ADD COLUMN IF NOT EXISTS "longitude" numeric(10, 7);--> statement-breakpoint
ALTER TABLE "netwatch_hosts" ADD COLUMN IF NOT EXISTS "location" text;--> statement-breakpoint
ALTER TABLE "netwatch_hosts" ADD COLUMN IF NOT EXISTS "device_type" text;--> statement-breakpoint
ALTER TABLE "netwatch_hosts" ADD COLUMN IF NOT EXISTS "waypoints" text;--> statement-breakpoint
ALTER TABLE "netwatch_hosts" ADD COLUMN IF NOT EXISTS "connection_type" text DEFAULT 'router';--> statement-breakpoint
ALTER TABLE "netwatch_hosts" ADD COLUMN IF NOT EXISTS "connected_to_id" uuid;