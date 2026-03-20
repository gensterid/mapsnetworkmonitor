DO $$ BEGIN
    CREATE TYPE "public"."genieacs_backup_type" AS ENUM('snapshot', 'template');
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
    ALTER TYPE "public"."router_backup_type" ADD VALUE 'email';
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "genieacs_backups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"onu_id" uuid,
	"sn" text NOT NULL,
	"vendor" text NOT NULL,
	"model" text NOT NULL,
	"name" text NOT NULL,
	"type" "genieacs_backup_type" DEFAULT 'snapshot' NOT NULL,
	"config" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- ALTER TABLE "router_metrics" ALTER COLUMN "id" DROP NOT NULL;
-- ALTER TABLE "device_performance_history" ALTER COLUMN "id" DROP NOT NULL;
-- ALTER TABLE "router_interface_metrics" ALTER COLUMN "id" DROP NOT NULL;
DO $$ BEGIN
    ALTER TABLE "router_metrics" ADD CONSTRAINT "router_metrics_id_recorded_at_pk" PRIMARY KEY("id","recorded_at");
EXCEPTION WHEN duplicate_object THEN null;
    WHEN OTHERS THEN
        IF SQLSTATE = '42P16' THEN null;
        ELSE RAISE;
        END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
    ALTER TABLE "device_performance_history" ADD CONSTRAINT "device_performance_history_id_recorded_at_pk" PRIMARY KEY("id","recorded_at");
EXCEPTION WHEN duplicate_object THEN null;
    WHEN OTHERS THEN
        IF SQLSTATE = '42P16' THEN null;
        ELSE RAISE;
        END IF;
END $$;--> statement-breakpoint
DO $$ BEGIN
    ALTER TABLE "router_interface_metrics" ADD CONSTRAINT "router_interface_metrics_id_recorded_at_pk" PRIMARY KEY("id","recorded_at");
EXCEPTION WHEN duplicate_object THEN null;
    WHEN OTHERS THEN
        IF SQLSTATE = '42P16' THEN null;
        ELSE RAISE;
        END IF;
END $$;--> statement-breakpoint
ALTER TABLE "olts" ADD COLUMN IF NOT EXISTS "status_reason" text;--> statement-breakpoint
ALTER TABLE "onus" ADD COLUMN IF NOT EXISTS "pppoe_user" text;--> statement-breakpoint
ALTER TABLE "onus" ADD COLUMN IF NOT EXISTS "pppoe_pass" text;--> statement-breakpoint
ALTER TABLE "onus" ADD COLUMN IF NOT EXISTS "vlan_id" integer;--> statement-breakpoint
DO $$ BEGIN
    ALTER TABLE "genieacs_backups" ADD CONSTRAINT "genieacs_backups_onu_id_onus_id_fk" FOREIGN KEY ("onu_id") REFERENCES "public"."onus"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "router_metrics_combined_idx" ON "router_metrics" USING btree ("router_id","recorded_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "dev_perf_combined_idx" ON "device_performance_history" USING btree ("router_id","recorded_at" DESC NULLS LAST);