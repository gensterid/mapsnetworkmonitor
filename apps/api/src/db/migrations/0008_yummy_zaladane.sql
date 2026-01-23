ALTER TABLE "router_netwatch" ADD COLUMN "last_known_latency" integer;--> statement-breakpoint
ALTER TABLE "pppoe_sessions" ADD COLUMN "status" text DEFAULT 'active';--> statement-breakpoint
ALTER TABLE "pppoe_sessions" ADD COLUMN "last_down" timestamp;--> statement-breakpoint
ALTER TABLE "pppoe_sessions" ADD COLUMN "last_latency" integer;