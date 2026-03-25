ALTER TYPE "public"."alert_type" ADD VALUE 'snmp_error';--> statement-breakpoint
DROP INDEX "router_metrics_combined_idx";--> statement-breakpoint
ALTER TABLE "router_metrics" ALTER COLUMN "id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "device_performance_history" ALTER COLUMN "id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "router_interface_metrics" ALTER COLUMN "id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "routers" ADD COLUMN "use_snmp" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "routers" ADD COLUMN "snmp_host" text;--> statement-breakpoint
ALTER TABLE "routers" ADD COLUMN "snmp_status" text DEFAULT 'unknown';--> statement-breakpoint
ALTER TABLE "routers" ADD COLUMN "last_snmp_error" text;--> statement-breakpoint
CREATE INDEX "router_interfaces_combined_idx" ON "router_interfaces" USING btree ("router_id","name");--> statement-breakpoint
CREATE INDEX "router_metrics_recorded_at_desc_idx" ON "router_metrics" USING btree ("recorded_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "router_metrics_combined_idx" ON "router_metrics" USING btree ("router_id","recorded_at");