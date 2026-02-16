ALTER TABLE "onus" DROP CONSTRAINT "onus_olt_id_olts_id_fk";
--> statement-breakpoint
ALTER TABLE "onus" ALTER COLUMN "olt_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "router_netwatch" ADD COLUMN "linked_onu_id" uuid;--> statement-breakpoint
ALTER TABLE "onus" ADD COLUMN "model" text;--> statement-breakpoint
ALTER TABLE "onus" ADD COLUMN "ssid" text;--> statement-breakpoint
ALTER TABLE "onus" ADD COLUMN "firmware_version" text;--> statement-breakpoint
ALTER TABLE "onus" ADD COLUMN "last_down_reason" text;--> statement-breakpoint
ALTER TABLE "onus" ADD COLUMN "connection_type" text DEFAULT 'router';--> statement-breakpoint
ALTER TABLE "onus" ADD COLUMN "connected_to_id" uuid;--> statement-breakpoint
ALTER TABLE "onus" ADD COLUMN "waypoints" text;--> statement-breakpoint
ALTER TABLE "onus" ADD COLUMN "target_interface" text;--> statement-breakpoint
ALTER TABLE "onus" ADD CONSTRAINT "onus_olt_id_olts_id_fk" FOREIGN KEY ("olt_id") REFERENCES "public"."olts"("id") ON DELETE set null ON UPDATE no action;