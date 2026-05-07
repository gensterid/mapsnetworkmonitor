CREATE TABLE IF NOT EXISTS "netwatch_ip_history" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "netwatch_id" uuid NOT NULL,
    "router_id" uuid NOT NULL,
    "tenant_id" uuid,
    "old_host" text,
    "new_host" text NOT NULL,
    "reason" text NOT NULL,
    "pppoe_user" text,
    "onu_id" uuid,
    "changed_by" text,
    "changed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
    ALTER TABLE "netwatch_ip_history" ADD CONSTRAINT "netwatch_ip_history_netwatch_id_router_netwatch_id_fk"
        FOREIGN KEY ("netwatch_id") REFERENCES "router_netwatch"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
    ALTER TABLE "netwatch_ip_history" ADD CONSTRAINT "netwatch_ip_history_router_id_routers_id_fk"
        FOREIGN KEY ("router_id") REFERENCES "routers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
DO $$ BEGIN
    ALTER TABLE "netwatch_ip_history" ADD CONSTRAINT "netwatch_ip_history_tenant_id_tenants_id_fk"
        FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "netwatch_history_netwatch_idx" ON "netwatch_ip_history" USING btree ("netwatch_id","changed_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "netwatch_history_router_idx" ON "netwatch_ip_history" USING btree ("router_id","changed_at");
