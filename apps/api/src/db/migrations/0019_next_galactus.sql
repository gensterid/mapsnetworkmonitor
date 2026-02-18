CREATE INDEX IF NOT EXISTS "pppoe_sessions_router_id_idx" ON "pppoe_sessions" USING btree ("router_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pppoe_sessions_name_idx" ON "pppoe_sessions" USING btree ("name");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pppoe_sessions_status_idx" ON "pppoe_sessions" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "pppoe_sessions_connected_at_idx" ON "pppoe_sessions" USING btree ("connected_at");