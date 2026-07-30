-- Kredensial Telnet CLI per-OLT bila beda dari web (C-Data CLI lazimnya
-- admin/admin atau root/admin). Null → driver provisioning fallback ke
-- webUsername/webPassword. Password disimpan terenkripsi (format v2:).
ALTER TABLE "olts" ADD COLUMN IF NOT EXISTS "telnet_username" text;
--> statement-breakpoint
ALTER TABLE "olts" ADD COLUMN IF NOT EXISTS "telnet_password" text;
