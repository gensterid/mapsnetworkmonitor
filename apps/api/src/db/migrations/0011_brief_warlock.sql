ALTER TABLE "pppoe_sessions" ADD COLUMN IF NOT EXISTS "tx_bytes" bigint DEFAULT 0;--> statement-breakpoint
ALTER TABLE "pppoe_sessions" ADD COLUMN IF NOT EXISTS "rx_bytes" bigint DEFAULT 0;--> statement-breakpoint
ALTER TABLE "pppoe_sessions" ADD COLUMN IF NOT EXISTS "tx_rate" bigint DEFAULT 0;--> statement-breakpoint
ALTER TABLE "pppoe_sessions" ADD COLUMN IF NOT EXISTS "rx_rate" bigint DEFAULT 0;--> statement-breakpoint
ALTER TABLE "pppoe_sessions" ADD COLUMN IF NOT EXISTS "last_traffic_update" timestamp;