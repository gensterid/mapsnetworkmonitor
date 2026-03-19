CREATE INDEX IF NOT EXISTS "alerts_router_resolved_idx" ON "alerts" USING btree ("router_id","resolved");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "alerts_router_created_at_idx" ON "alerts" USING btree ("router_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "router_netwatch_router_status_idx" ON "router_netwatch" USING btree ("router_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "router_netwatch_last_up_idx" ON "router_netwatch" USING btree ("last_up");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "router_netwatch_last_down_idx" ON "router_netwatch" USING btree ("last_down");