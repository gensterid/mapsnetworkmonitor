DO $$ BEGIN
    CREATE TYPE "public"."user_role" AS ENUM('admin', 'operator', 'user');
EXCEPTION
    WHEN duplicate_object THEN null;
    WHEN OTHERS THEN
        IF (SQLSTATE = '42P07') THEN null;
        ELSE RAISE;
        END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
    CREATE TYPE "public"."router_status" AS ENUM('online', 'offline', 'maintenance', 'unknown');
EXCEPTION
    WHEN duplicate_object THEN null;
    WHEN OTHERS THEN
        IF (SQLSTATE = '42P07') THEN null;
        ELSE RAISE;
        END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
    CREATE TYPE "public"."alert_severity" AS ENUM('info', 'warning', 'critical');
EXCEPTION
    WHEN duplicate_object THEN null;
    WHEN OTHERS THEN
        IF (SQLSTATE = '42P07') THEN null;
        ELSE RAISE;
        END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
    CREATE TYPE "public"."alert_type" AS ENUM('status_change', 'high_cpu', 'high_memory', 'high_disk', 'interface_down', 'netwatch_down', 'threshold', 'reboot');
EXCEPTION
    WHEN duplicate_object THEN null;
    WHEN OTHERS THEN
        IF (SQLSTATE = '42P07') THEN null;
        ELSE RAISE;
        END IF;
END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"image" text,
	"email_verified" boolean DEFAULT false NOT NULL,
	"role" "user_role" DEFAULT 'user' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "verifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "router_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"color" text DEFAULT '#3b82f6',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "router_interfaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"router_id" uuid NOT NULL,
	"name" text NOT NULL,
	"default_name" text,
	"type" text,
	"mac_address" text,
	"status" text,
	"tx_bytes" bigint DEFAULT 0,
	"rx_bytes" bigint DEFAULT 0,
	"tx_packets" bigint DEFAULT 0,
	"rx_packets" bigint DEFAULT 0,
	"tx_drops" bigint DEFAULT 0,
	"rx_drops" bigint DEFAULT 0,
	"tx_errors" bigint DEFAULT 0,
	"rx_errors" bigint DEFAULT 0,
	"speed" text,
	"running" boolean DEFAULT false,
	"disabled" boolean DEFAULT false,
	"comment" text,
	"last_updated" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "router_metrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"router_id" uuid NOT NULL,
	"cpu_load" real,
	"cpu_count" integer,
	"cpu_frequency" integer,
	"total_memory" bigint,
	"used_memory" bigint,
	"free_memory" bigint,
	"total_disk" bigint,
	"used_disk" bigint,
	"free_disk" bigint,
	"uptime" integer,
	"temperature" real,
	"voltage" real,
	"board_temp" real,
	"current_firmware" text,
	"upgrade_firmware" text,
	"recorded_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "routers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"host" text NOT NULL,
	"port" integer DEFAULT 8728 NOT NULL,
	"username" text NOT NULL,
	"password_encrypted" text NOT NULL,
	"router_os_version" text,
	"model" text,
	"serial_number" text,
	"identity" text,
	"board_name" text,
	"architecture" text,
	"latitude" numeric(10, 7),
	"longitude" numeric(10, 7),
	"location" text,
	"location_image" text,
	"status" "router_status" DEFAULT 'unknown' NOT NULL,
	"group_id" uuid,
	"notes" text,
	"last_seen" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "alerts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"router_id" uuid NOT NULL,
	"type" "alert_type" NOT NULL,
	"severity" "alert_severity" NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"acknowledged" boolean DEFAULT false NOT NULL,
	"acknowledged_by" uuid,
	"acknowledged_at" timestamp,
	"resolved" boolean DEFAULT false NOT NULL,
	"resolved_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "netwatch_hosts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"router_id" uuid NOT NULL,
	"host" text NOT NULL,
	"name" text,
	"comment" text,
	"status" text,
	"timeout" integer DEFAULT 1000,
	"interval" integer DEFAULT 10,
	"since_up" timestamp,
	"since_down" timestamp,
	"disabled" boolean DEFAULT false,
	"last_updated" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "app_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"value" jsonb,
	"description" text,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "app_settings_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" uuid,
	"details" jsonb,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
    ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
    ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
    ALTER TABLE "router_interfaces" ADD CONSTRAINT "router_interfaces_router_id_routers_id_fk" FOREIGN KEY ("router_id") REFERENCES "public"."routers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
    ALTER TABLE "router_metrics" ADD CONSTRAINT "router_metrics_router_id_routers_id_fk" FOREIGN KEY ("router_id") REFERENCES "public"."routers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
    ALTER TABLE "routers" ADD CONSTRAINT "routers_group_id_router_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."router_groups"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
    ALTER TABLE "alerts" ADD CONSTRAINT "alerts_router_id_routers_id_fk" FOREIGN KEY ("router_id") REFERENCES "public"."routers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
    ALTER TABLE "alerts" ADD CONSTRAINT "alerts_acknowledged_by_users_id_fk" FOREIGN KEY ("acknowledged_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
    ALTER TABLE "netwatch_hosts" ADD CONSTRAINT "netwatch_hosts_router_id_routers_id_fk" FOREIGN KEY ("router_id") REFERENCES "public"."routers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
    ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;