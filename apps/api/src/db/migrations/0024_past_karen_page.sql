CREATE TABLE IF NOT EXISTS "device_performance_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"router_id" uuid NOT NULL,
	"host" text,
	"onu_id" uuid,
	"latency" real,
	"signal" real,
	"recorded_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "router_netwatch" ADD COLUMN IF NOT EXISTS "disabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "device_performance_history" ADD CONSTRAINT "device_performance_history_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_performance_history" ADD CONSTRAINT "device_performance_history_router_id_routers_id_fk" FOREIGN KEY ("router_id") REFERENCES "public"."routers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_performance_history" ADD CONSTRAINT "device_performance_history_onu_id_onus_id_fk" FOREIGN KEY ("onu_id") REFERENCES "public"."onus"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "dev_perf_router_id_idx" ON "device_performance_history" USING btree ("router_id");--> statement-breakpoint
CREATE INDEX "dev_perf_tenant_id_idx" ON "device_performance_history" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "dev_perf_host_idx" ON "device_performance_history" USING btree ("host");--> statement-breakpoint
CREATE INDEX "dev_perf_onu_id_idx" ON "device_performance_history" USING btree ("onu_id");--> statement-breakpoint
CREATE INDEX "dev_perf_recorded_at_idx" ON "device_performance_history" USING btree ("recorded_at");--> statement-breakpoint
CREATE INDEX "alerts_acknowledged_idx" ON "alerts" USING btree ("acknowledged");--> statement-breakpoint
CREATE INDEX "alerts_tenant_acknowledged_idx" ON "alerts" USING btree ("tenant_id","acknowledged");