CREATE TABLE IF NOT EXISTS "client_bandwidth_history" (
    "id" uuid DEFAULT gen_random_uuid() NOT NULL,
    "tenant_id" uuid NOT NULL,
    "router_id" uuid NOT NULL,
    "identifier" text NOT NULL,
    "identifier_type" text NOT NULL,
    "tx_bytes_delta" bigint NOT NULL,
    "rx_bytes_delta" bigint NOT NULL,
    "interval_seconds" integer NOT NULL,
    "recorded_at" timestamp DEFAULT now() NOT NULL,
    CONSTRAINT "client_bandwidth_history_pkey" PRIMARY KEY ("id", "recorded_at")
);
--> statement-breakpoint
DO $$ BEGIN
    ALTER TABLE "client_bandwidth_history" ADD CONSTRAINT "cbw_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
    ALTER TABLE "client_bandwidth_history" ADD CONSTRAINT "cbw_router_id_fk" FOREIGN KEY ("router_id") REFERENCES "public"."routers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cbw_tenant_router_recorded_idx" ON "client_bandwidth_history" USING btree ("tenant_id","router_id","recorded_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cbw_tenant_router_identifier_recorded_idx" ON "client_bandwidth_history" USING btree ("tenant_id","router_id","identifier","recorded_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cbw_recorded_at_idx" ON "client_bandwidth_history" USING btree ("recorded_at");
