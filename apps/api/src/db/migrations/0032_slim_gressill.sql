ALTER TABLE "users" ALTER COLUMN "timezone" SET DEFAULT 'Asia/Makassar';--> statement-breakpoint
ALTER TABLE "router_netwatch" ALTER COLUMN "host" DROP NOT NULL;--> statement-breakpoint
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='router_interfaces' AND column_name='last_traffic_at') THEN
        ALTER TABLE "router_interfaces" ADD COLUMN "last_traffic_at" timestamp;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='router_netwatch' AND column_name='port_capacity') THEN
        ALTER TABLE "router_netwatch" ADD COLUMN "port_capacity" integer DEFAULT 8;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='router_netwatch' AND column_name='splitter_ratio') THEN
        ALTER TABLE "router_netwatch" ADD COLUMN "splitter_ratio" text;
    END IF;
END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "router_netwatch_router_host_unique_idx" ON "router_netwatch" USING btree ("router_id","host");