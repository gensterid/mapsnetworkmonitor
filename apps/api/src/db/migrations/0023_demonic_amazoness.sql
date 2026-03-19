ALTER TYPE "public"."user_role" ADD VALUE 'superadmin' BEFORE 'admin';--> statement-breakpoint
ALTER TYPE "public"."device_type" ADD VALUE 'router';--> statement-breakpoint
ALTER TYPE "public"."device_type" ADD VALUE 'switch';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"settings" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tenants_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_tenants" (
	"user_id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	CONSTRAINT "user_tenants_user_id_tenant_id_pk" PRIMARY KEY("user_id","tenant_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "topology_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"router_id" uuid NOT NULL,
	"source_node_id" uuid NOT NULL,
	"target_node_id" uuid NOT NULL,
	"source_interface" text,
	"target_interface" text,
	"source_handle" text,
	"target_handle" text,
	"path_offset" numeric(10, 2) DEFAULT '0',
	"animation_type" text DEFAULT 'pulse',
	"notes" text,
	"tenant_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "topology_nodes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"router_id" uuid NOT NULL,
	"node_id" uuid,
	"node_type" text NOT NULL,
	"custom_name" text,
	"custom_host" text,
	"custom_type" text,
	"notes" text,
	"x" numeric(10, 2) DEFAULT '0' NOT NULL,
	"y" numeric(10, 2) DEFAULT '0' NOT NULL,
	"tenant_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app_settings" DROP CONSTRAINT "app_settings_key_unique";--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "ai_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "ai_api_key" text;--> statement-breakpoint
ALTER TABLE "router_groups" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;--> statement-breakpoint
ALTER TABLE "router_metrics" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;--> statement-breakpoint
ALTER TABLE "router_netwatch" ADD COLUMN IF NOT EXISTS "topology_x" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "router_netwatch" ADD COLUMN IF NOT EXISTS "topology_y" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "router_netwatch" ADD COLUMN IF NOT EXISTS "has_webhook" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "router_netwatch" ADD COLUMN IF NOT EXISTS "is_app_only" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "router_netwatch" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;--> statement-breakpoint
ALTER TABLE "routers" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;--> statement-breakpoint
ALTER TABLE "routers" ADD COLUMN IF NOT EXISTS "gateway_id" uuid;--> statement-breakpoint
ALTER TABLE "routers" ADD COLUMN IF NOT EXISTS "romon_mac" text;--> statement-breakpoint
ALTER TABLE "routers" ADD COLUMN IF NOT EXISTS "parent_interface" text;--> statement-breakpoint
ALTER TABLE "routers" ADD COLUMN IF NOT EXISTS "last_neighbors_sync" timestamp;--> statement-breakpoint
ALTER TABLE "routers" ADD COLUMN IF NOT EXISTS "topology_x" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "routers" ADD COLUMN IF NOT EXISTS "topology_y" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "routers" ADD COLUMN IF NOT EXISTS "last_full_sync" timestamp;--> statement-breakpoint
ALTER TABLE "routers" ADD COLUMN IF NOT EXISTS "last_error_message" text;--> statement-breakpoint
ALTER TABLE "alerts" ADD COLUMN IF NOT EXISTS "tenant_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "alerts" ADD COLUMN IF NOT EXISTS "ai_analysis" text;--> statement-breakpoint
ALTER TABLE "netwatch_hosts" ADD COLUMN IF NOT EXISTS "tenant_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "app_settings" ADD COLUMN IF NOT EXISTS "tenant_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;--> statement-breakpoint
ALTER TABLE "notification_groups" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;--> statement-breakpoint
ALTER TABLE "pppoe_sessions" ADD COLUMN IF NOT EXISTS "tenant_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "olts" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;--> statement-breakpoint
ALTER TABLE "olts" ADD COLUMN IF NOT EXISTS "topology_x" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "olts" ADD COLUMN IF NOT EXISTS "topology_y" numeric(10, 2);--> statement-breakpoint
ALTER TABLE "onus" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;--> statement-breakpoint
ALTER TABLE "user_tenants" ADD CONSTRAINT "user_tenants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_tenants" ADD CONSTRAINT "user_tenants_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topology_links" ADD CONSTRAINT "topology_links_router_id_routers_id_fk" FOREIGN KEY ("router_id") REFERENCES "public"."routers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topology_links" ADD CONSTRAINT "topology_links_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topology_nodes" ADD CONSTRAINT "topology_nodes_router_id_routers_id_fk" FOREIGN KEY ("router_id") REFERENCES "public"."routers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topology_nodes" ADD CONSTRAINT "topology_nodes_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "topology_links_router_id_idx" ON "topology_links" USING btree ("router_id");--> statement-breakpoint
CREATE INDEX "topology_links_source_idx" ON "topology_links" USING btree ("source_node_id");--> statement-breakpoint
CREATE INDEX "topology_links_target_idx" ON "topology_links" USING btree ("target_node_id");--> statement-breakpoint
CREATE INDEX "topology_links_tenant_id_idx" ON "topology_links" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "topology_nodes_router_id_idx" ON "topology_nodes" USING btree ("router_id");--> statement-breakpoint
CREATE INDEX "topology_nodes_node_id_idx" ON "topology_nodes" USING btree ("node_id");--> statement-breakpoint
CREATE INDEX "topology_nodes_tenant_id_idx" ON "topology_nodes" USING btree ("tenant_id");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "router_groups" ADD CONSTRAINT "router_groups_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "router_metrics" ADD CONSTRAINT "router_metrics_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "router_netwatch" ADD CONSTRAINT "router_netwatch_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routers" ADD CONSTRAINT "routers_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routers" ADD CONSTRAINT "routers_gateway_id_routers_id_fk" FOREIGN KEY ("gateway_id") REFERENCES "public"."routers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "netwatch_hosts" ADD CONSTRAINT "netwatch_hosts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_settings" ADD CONSTRAINT "app_settings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_groups" ADD CONSTRAINT "notification_groups_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pppoe_sessions" ADD CONSTRAINT "pppoe_sessions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "olts" ADD CONSTRAINT "olts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "onus" ADD CONSTRAINT "onus_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "router_metrics_tenant_id_idx" ON "router_metrics" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "router_netwatch_tenant_id_idx" ON "router_netwatch" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "alerts_tenant_id_idx" ON "alerts" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "netwatch_hosts_tenant_id_idx" ON "netwatch_hosts" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "app_settings_tenant_id_idx" ON "app_settings" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "audit_logs_tenant_id_idx" ON "audit_logs" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "pppoe_sessions_tenant_id_idx" ON "pppoe_sessions" USING btree ("tenant_id");--> statement-breakpoint
ALTER TABLE "app_settings" ADD CONSTRAINT "app_settings_tenant_key_unique" UNIQUE("tenant_id","key");