ALTER TABLE "router_netwatch" ADD COLUMN IF NOT EXISTS "tx_rate" bigint DEFAULT 0;--> statement-breakpoint
ALTER TABLE "router_netwatch" ADD COLUMN IF NOT EXISTS "rx_rate" bigint DEFAULT 0;--> statement-breakpoint
ALTER TABLE "routers" ADD COLUMN IF NOT EXISTS "snmp_community" text DEFAULT 'public';--> statement-breakpoint
ALTER TABLE "routers" ADD COLUMN IF NOT EXISTS "snmp_port" integer DEFAULT 161;