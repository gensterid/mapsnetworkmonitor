ALTER TABLE "router_netwatch" ADD COLUMN "tx_rate" bigint DEFAULT 0;--> statement-breakpoint
ALTER TABLE "router_netwatch" ADD COLUMN "rx_rate" bigint DEFAULT 0;--> statement-breakpoint
ALTER TABLE "routers" ADD COLUMN "snmp_community" text DEFAULT 'public';--> statement-breakpoint
ALTER TABLE "routers" ADD COLUMN "snmp_port" integer DEFAULT 161;