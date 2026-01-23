ALTER TYPE "public"."alert_type" ADD VALUE 'pppoe_connect';--> statement-breakpoint
ALTER TYPE "public"."alert_type" ADD VALUE 'pppoe_disconnect';--> statement-breakpoint
CREATE TABLE "notification_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"telegram_enabled" boolean DEFAULT false,
	"telegram_bot_token" text,
	"telegram_chat_id" text,
	"telegram_thread_id" text,
	"whatsapp_enabled" boolean DEFAULT false,
	"whatsapp_url" text,
	"whatsapp_key" text,
	"whatsapp_to" text,
	"message_template" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pppoe_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"router_id" uuid NOT NULL,
	"name" text NOT NULL,
	"session_id" text,
	"caller_id" text,
	"address" text,
	"service" text,
	"uptime" text,
	"latitude" text,
	"longitude" text,
	"waypoints" text,
	"connection_type" text DEFAULT 'router',
	"connected_to_id" uuid,
	"connected_at" timestamp DEFAULT now() NOT NULL,
	"last_seen" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "animation_style" text DEFAULT 'default';--> statement-breakpoint
ALTER TABLE "router_netwatch" ADD COLUMN "latency" integer;--> statement-breakpoint
ALTER TABLE "router_netwatch" ADD COLUMN "packet_loss" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "routers" ADD COLUMN "notification_group_id" uuid;--> statement-breakpoint
ALTER TABLE "alerts" ADD COLUMN "escalation_level" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "alerts" ADD COLUMN "last_escalated_at" timestamp;--> statement-breakpoint
ALTER TABLE "pppoe_sessions" ADD CONSTRAINT "pppoe_sessions_router_id_routers_id_fk" FOREIGN KEY ("router_id") REFERENCES "public"."routers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routers" ADD CONSTRAINT "routers_notification_group_id_notification_groups_id_fk" FOREIGN KEY ("notification_group_id") REFERENCES "public"."notification_groups"("id") ON DELETE set null ON UPDATE no action;