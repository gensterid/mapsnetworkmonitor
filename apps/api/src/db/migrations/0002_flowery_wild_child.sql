DO $$ BEGIN
    CREATE TYPE "public"."device_type" AS ENUM('client', 'olt', 'odp');
EXCEPTION
    WHEN duplicate_object THEN null;
    WHEN OTHERS THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "username" text;--> statement-breakpoint
ALTER TABLE "router_netwatch" ADD COLUMN IF NOT EXISTS "device_type" "device_type" DEFAULT 'client';--> statement-breakpoint
ALTER TABLE "router_netwatch" ADD COLUMN IF NOT EXISTS "waypoints" text;--> statement-breakpoint
DO $$ BEGIN
    ALTER TABLE "users" ADD CONSTRAINT "users_username_unique" UNIQUE("username");
EXCEPTION
    WHEN duplicate_object THEN null;
    WHEN OTHERS THEN
        IF (SQLSTATE = '42P07') THEN null;
        ELSE RAISE;
        END IF;
END $$;