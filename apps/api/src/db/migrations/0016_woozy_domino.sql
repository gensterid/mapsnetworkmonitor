DO $$ BEGIN
    CREATE TYPE "public"."onu_status" AS ENUM('online', 'offline', 'lost', 'power_down', 'dying_gasp', 'unknown');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
    CREATE TYPE "public"."preset_type" AS ENUM('wan', 'wifi');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "onus" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sn" text NOT NULL,
	"olt_id" uuid NOT NULL,
	"pon_port" text,
	"onu_index" text,
	"name" text,
	"host" text,
	"last_rx_power" text,
	"status" "onu_status" DEFAULT 'unknown' NOT NULL,
	"last_seen" timestamp,
	"latitude" numeric(10, 7),
	"longitude" numeric(10, 7),
	"location" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"discovery_sources" json DEFAULT '[]'::json,
	CONSTRAINT "onus_sn_unique" UNIQUE("sn")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "presets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"type" "preset_type" NOT NULL,
	"config" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "routers" ADD COLUMN IF NOT EXISTS "genieacs_username" text;--> statement-breakpoint
ALTER TABLE "routers" ADD COLUMN IF NOT EXISTS "genieacs_password_encrypted" text;--> statement-breakpoint
ALTER TABLE "olts" ADD COLUMN IF NOT EXISTS "last_snmp_status" text;--> statement-breakpoint
ALTER TABLE "olts" ADD COLUMN IF NOT EXISTS "last_web_status" text;--> statement-breakpoint
DO $$ BEGIN
    ALTER TABLE "onus" ADD CONSTRAINT "onus_olt_id_olts_id_fk" FOREIGN KEY ("olt_id") REFERENCES "public"."olts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;