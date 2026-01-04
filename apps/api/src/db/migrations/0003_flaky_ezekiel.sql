ALTER TABLE "router_netwatch" ADD COLUMN "connection_type" text DEFAULT 'router';--> statement-breakpoint
ALTER TABLE "router_netwatch" ADD COLUMN "connected_to_id" uuid;