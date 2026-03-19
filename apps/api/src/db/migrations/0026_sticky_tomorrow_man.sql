ALTER TABLE "routers" ADD COLUMN IF NOT EXISTS "email_smtp_start_time" text;--> statement-breakpoint
ALTER TABLE "routers" ADD COLUMN IF NOT EXISTS "email_smtp_export_delay" integer DEFAULT 10;--> statement-breakpoint
ALTER TABLE "routers" ADD COLUMN IF NOT EXISTS "email_smtp_cleanup_delay" integer DEFAULT 30;