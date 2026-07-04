-- Metadata garis peta: penanda jarak (distance_markers) + fiber multi-core
-- (fiber_cores). Disimpan JSON di device pemilik garis (mirror `waypoints`).

ALTER TABLE "router_netwatch" ADD COLUMN IF NOT EXISTS "distance_markers" text;--> statement-breakpoint
ALTER TABLE "router_netwatch" ADD COLUMN IF NOT EXISTS "fiber_cores" text;--> statement-breakpoint
ALTER TABLE "onus" ADD COLUMN IF NOT EXISTS "distance_markers" text;--> statement-breakpoint
ALTER TABLE "onus" ADD COLUMN IF NOT EXISTS "fiber_cores" text;--> statement-breakpoint
ALTER TABLE "pppoe_sessions" ADD COLUMN IF NOT EXISTS "distance_markers" text;--> statement-breakpoint
ALTER TABLE "pppoe_sessions" ADD COLUMN IF NOT EXISTS "fiber_cores" text;
