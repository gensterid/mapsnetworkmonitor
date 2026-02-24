ALTER TABLE "routers" ADD COLUMN "use_webhook" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "routers" ADD COLUMN "webhook_secret" text;--> statement-breakpoint
ALTER TABLE "routers" ADD COLUMN "polling_interval_metrics" integer DEFAULT 300 NOT NULL;--> statement-breakpoint
ALTER TABLE "onus" ADD COLUMN "router_id" uuid;--> statement-breakpoint
ALTER TABLE "onus" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "onus" ADD CONSTRAINT "onus_router_id_routers_id_fk" FOREIGN KEY ("router_id") REFERENCES "public"."routers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "onus_router_id_idx" ON "onus" USING btree ("router_id");