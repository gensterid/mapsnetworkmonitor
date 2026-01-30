ALTER TYPE "public"."alert_type" ADD VALUE 'system';--> statement-breakpoint
ALTER TABLE "netwatch_hosts" ADD COLUMN "last_check" timestamp;--> statement-breakpoint
ALTER TABLE "netwatch_hosts" ADD COLUMN "last_up" timestamp;--> statement-breakpoint
ALTER TABLE "netwatch_hosts" ADD COLUMN "last_down" timestamp;--> statement-breakpoint
ALTER TABLE "netwatch_hosts" ADD COLUMN "latency" integer;--> statement-breakpoint
ALTER TABLE "netwatch_hosts" ADD COLUMN "last_known_latency" integer;--> statement-breakpoint
ALTER TABLE "netwatch_hosts" ADD COLUMN "packet_loss" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "netwatch_hosts" ADD COLUMN "latitude" numeric(10, 7);--> statement-breakpoint
ALTER TABLE "netwatch_hosts" ADD COLUMN "longitude" numeric(10, 7);--> statement-breakpoint
ALTER TABLE "netwatch_hosts" ADD COLUMN "location" text;--> statement-breakpoint
ALTER TABLE "netwatch_hosts" ADD COLUMN "device_type" text;--> statement-breakpoint
ALTER TABLE "netwatch_hosts" ADD COLUMN "waypoints" text;--> statement-breakpoint
ALTER TABLE "netwatch_hosts" ADD COLUMN "connection_type" text DEFAULT 'router';--> statement-breakpoint
ALTER TABLE "netwatch_hosts" ADD COLUMN "connected_to_id" uuid;