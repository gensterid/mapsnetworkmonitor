ALTER TABLE "routers" ADD COLUMN "email_smtp_start_time" text;--> statement-breakpoint
ALTER TABLE "routers" ADD COLUMN "email_smtp_export_delay" integer DEFAULT 10;--> statement-breakpoint
ALTER TABLE "routers" ADD COLUMN "email_smtp_cleanup_delay" integer DEFAULT 30;