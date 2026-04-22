ALTER TABLE "onus" ADD COLUMN IF NOT EXISTS "archived_at" timestamp;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "onus_archived_at_idx" ON "onus" USING btree ("archived_at");
