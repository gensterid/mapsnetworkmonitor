CREATE TYPE "public"."genieacs_backup_type" AS ENUM('snapshot', 'template');--> statement-breakpoint
ALTER TYPE "public"."router_backup_type" ADD VALUE 'email';--> statement-breakpoint
CREATE TABLE "genieacs_backups" (
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
/* 
    Unfortunately in current drizzle-kit version we can't automatically get name for primary key.
    We are working on making it available!

    Meanwhile you can:
        1. Check pk name in your database, by running
            SELECT constraint_name FROM information_schema.table_constraints
            WHERE table_schema = 'public'
                AND table_name = 'router_metrics'
                AND constraint_type = 'PRIMARY KEY';
        2. Uncomment code below and paste pk name manually
        
    Hope to release this update as soon as possible
*/

-- ALTER TABLE "router_metrics" DROP CONSTRAINT "<constraint_name>";--> statement-breakpoint
ALTER TABLE "router_metrics" ALTER COLUMN "id" DROP NOT NULL;--> statement-breakpoint
/* 
    Unfortunately in current drizzle-kit version we can't automatically get name for primary key.
    We are working on making it available!

    Meanwhile you can:
        1. Check pk name in your database, by running
            SELECT constraint_name FROM information_schema.table_constraints
            WHERE table_schema = 'public'
                AND table_name = 'device_performance_history'
                AND constraint_type = 'PRIMARY KEY';
        2. Uncomment code below and paste pk name manually
        
    Hope to release this update as soon as possible
*/

-- ALTER TABLE "device_performance_history" DROP CONSTRAINT "<constraint_name>";--> statement-breakpoint
ALTER TABLE "device_performance_history" ALTER COLUMN "id" DROP NOT NULL;--> statement-breakpoint
/* 
    Unfortunately in current drizzle-kit version we can't automatically get name for primary key.
    We are working on making it available!

    Meanwhile you can:
        1. Check pk name in your database, by running
            SELECT constraint_name FROM information_schema.table_constraints
            WHERE table_schema = 'public'
                AND table_name = 'router_interface_metrics'
                AND constraint_type = 'PRIMARY KEY';
        2. Uncomment code below and paste pk name manually
        
    Hope to release this update as soon as possible
*/

-- ALTER TABLE "router_interface_metrics" DROP CONSTRAINT "<constraint_name>";--> statement-breakpoint
ALTER TABLE "router_interface_metrics" ALTER COLUMN "id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "router_metrics" ADD CONSTRAINT "router_metrics_id_recorded_at_pk" PRIMARY KEY("id","recorded_at");--> statement-breakpoint
ALTER TABLE "device_performance_history" ADD CONSTRAINT "device_performance_history_id_recorded_at_pk" PRIMARY KEY("id","recorded_at");--> statement-breakpoint
ALTER TABLE "router_interface_metrics" ADD CONSTRAINT "router_interface_metrics_id_recorded_at_pk" PRIMARY KEY("id","recorded_at");--> statement-breakpoint
ALTER TABLE "olts" ADD COLUMN "status_reason" text;--> statement-breakpoint
ALTER TABLE "onus" ADD COLUMN "pppoe_user" text;--> statement-breakpoint
ALTER TABLE "onus" ADD COLUMN "pppoe_pass" text;--> statement-breakpoint
ALTER TABLE "onus" ADD COLUMN "vlan_id" integer;--> statement-breakpoint
ALTER TABLE "genieacs_backups" ADD CONSTRAINT "genieacs_backups_onu_id_onus_id_fk" FOREIGN KEY ("onu_id") REFERENCES "public"."onus"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "router_metrics_combined_idx" ON "router_metrics" USING btree ("router_id","recorded_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "dev_perf_combined_idx" ON "device_performance_history" USING btree ("router_id","recorded_at" DESC NULLS LAST);