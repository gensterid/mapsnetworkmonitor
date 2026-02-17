ALTER TABLE "router_netwatch" ADD COLUMN IF NOT EXISTS "connection_type" text DEFAULT 'router';--> statement-breakpoint
ALTER TABLE "router_netwatch" ADD COLUMN IF NOT EXISTS "connected_to_id" uuid;