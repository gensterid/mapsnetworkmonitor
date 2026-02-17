ALTER TABLE "router_netwatch" ADD COLUMN IF NOT EXISTS "last_known_latency" integer;--> statement-breakpoint
ALTER TABLE "pppoe_sessions" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'active';--> statement-breakpoint
ALTER TABLE "pppoe_sessions" ADD COLUMN IF NOT EXISTS "last_down" timestamp;--> statement-breakpoint
ALTER TABLE "pppoe_sessions" ADD COLUMN IF NOT EXISTS "last_latency" integer;