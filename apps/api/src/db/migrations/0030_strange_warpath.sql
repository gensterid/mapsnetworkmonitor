DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_enum e ON t.oid = e.enumtypid WHERE t.typname = 'alert_type' AND e.enumlabel = 'snmp_error') THEN 
        ALTER TYPE "public"."alert_type" ADD VALUE 'snmp_error'; 
    END IF; 
END $$;--> statement-breakpoint
DROP INDEX IF EXISTS "router_metrics_combined_idx";--> statement-breakpoint
ALTER TABLE "router_metrics" ALTER COLUMN "id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "device_performance_history" ALTER COLUMN "id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "router_interface_metrics" ALTER COLUMN "id" SET NOT NULL;--> statement-breakpoint
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='routers' AND column_name='use_snmp') THEN
        ALTER TABLE "routers" ADD COLUMN "use_snmp" boolean DEFAULT true NOT NULL;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='routers' AND column_name='snmp_host') THEN
        ALTER TABLE "routers" ADD COLUMN "snmp_host" text;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='routers' AND column_name='snmp_status') THEN
        ALTER TABLE "routers" ADD COLUMN "snmp_status" text DEFAULT 'unknown';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='routers' AND column_name='last_snmp_error') THEN
        ALTER TABLE "routers" ADD COLUMN "last_snmp_error" text;
    END IF;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "router_interfaces_combined_idx" ON "router_interfaces" USING btree ("router_id","name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "router_metrics_recorded_at_desc_idx" ON "router_metrics" USING btree ("recorded_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "router_metrics_combined_idx" ON "router_metrics" USING btree ("router_id","recorded_at");