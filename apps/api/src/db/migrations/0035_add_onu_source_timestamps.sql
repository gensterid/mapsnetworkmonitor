ALTER TABLE "onus" ADD COLUMN IF NOT EXISTS "last_seen_olt" timestamp;--> statement-breakpoint
ALTER TABLE "onus" ADD COLUMN IF NOT EXISTS "last_seen_acs" timestamp;
