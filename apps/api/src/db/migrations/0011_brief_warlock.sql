ALTER TABLE "pppoe_sessions" ADD COLUMN "tx_bytes" bigint DEFAULT 0;--> statement-breakpoint
ALTER TABLE "pppoe_sessions" ADD COLUMN "rx_bytes" bigint DEFAULT 0;--> statement-breakpoint
ALTER TABLE "pppoe_sessions" ADD COLUMN "tx_rate" bigint DEFAULT 0;--> statement-breakpoint
ALTER TABLE "pppoe_sessions" ADD COLUMN "rx_rate" bigint DEFAULT 0;--> statement-breakpoint
ALTER TABLE "pppoe_sessions" ADD COLUMN "last_traffic_update" timestamp;