-- Fiber cables (Cara C): objek kabel digambar bebas + membawa sekumpulan core.
-- Independen dari device-tree. Dirender belang N-core di peta.
-- Lihat docs/FIBER-CABLE-DESIGN.md.

CREATE TABLE IF NOT EXISTS "fiber_cables" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid REFERENCES "tenants"("id") ON DELETE cascade,
	"router_id" uuid REFERENCES "routers"("id") ON DELETE set null,
	"name" text,
	"path" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"cores" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"from_device_id" uuid,
	"to_device_id" uuid,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fiber_cables_tenant_id_idx" ON "fiber_cables" ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fiber_cables_router_id_idx" ON "fiber_cables" ("router_id");
