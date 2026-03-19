DO $$ BEGIN
    CREATE TYPE "public"."router_backup_type" AS ENUM('backup', 'rsc', 'json');
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "router_interface_metrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"interface_id" uuid NOT NULL,
	"tx_rate" bigint DEFAULT 0,
	"rx_rate" bigint DEFAULT 0,
	"tenant_id" uuid,
	"recorded_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "router_backups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"router_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"filename" text NOT NULL,
	"type" "router_backup_type" NOT NULL,
	"size" bigint DEFAULT 0,
	"comment" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "routers" ADD COLUMN IF NOT EXISTS "email_smtp_server" text;--> statement-breakpoint
ALTER TABLE "routers" ADD COLUMN IF NOT EXISTS "email_smtp_port" integer;--> statement-breakpoint
ALTER TABLE "routers" ADD COLUMN IF NOT EXISTS "email_smtp_user" text;--> statement-breakpoint
ALTER TABLE "routers" ADD COLUMN IF NOT EXISTS "email_smtp_pass_encrypted" text;--> statement-breakpoint
ALTER TABLE "routers" ADD COLUMN IF NOT EXISTS "email_smtp_recipient" text;--> statement-breakpoint
ALTER TABLE "routers" ADD COLUMN IF NOT EXISTS "email_smtp_interval" text;--> statement-breakpoint
ALTER TABLE "device_performance_history" ADD COLUMN IF NOT EXISTS "error_message" text;--> statement-breakpoint
DO $$ BEGIN
    ALTER TABLE "router_interface_metrics" ADD CONSTRAINT "router_interface_metrics_interface_id_router_interfaces_id_fk" FOREIGN KEY ("interface_id") REFERENCES "public"."router_interfaces"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
    ALTER TABLE "router_interface_metrics" ADD CONSTRAINT "router_interface_metrics_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
    ALTER TABLE "router_backups" ADD CONSTRAINT "router_backups_router_id_routers_id_fk" FOREIGN KEY ("router_id") REFERENCES "public"."routers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
    ALTER TABLE "router_backups" ADD CONSTRAINT "router_backups_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "router_if_metrics_interface_id_idx" ON "router_interface_metrics" USING btree ("interface_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "router_if_metrics_tenant_id_idx" ON "router_interface_metrics" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "router_if_metrics_recorded_at_idx" ON "router_interface_metrics" USING btree ("recorded_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "router_backups_router_id_idx" ON "router_backups" USING btree ("router_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "router_backups_tenant_id_idx" ON "router_backups" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "router_backups_created_at_idx" ON "router_backups" USING btree ("created_at");