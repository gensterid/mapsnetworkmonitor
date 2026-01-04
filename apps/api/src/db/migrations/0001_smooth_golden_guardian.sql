DO $$ BEGIN
    CREATE TYPE "public"."netwatch_status" AS ENUM('up', 'down', 'unknown');
EXCEPTION
    WHEN duplicate_object THEN null;
    WHEN OTHERS THEN
        IF (SQLSTATE = '42P07') THEN null;
        ELSE RAISE;
        END IF;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "router_netwatch" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"router_id" uuid NOT NULL,
	"host" text NOT NULL,
	"name" text,
	"interval" integer DEFAULT 30,
	"status" "netwatch_status" DEFAULT 'unknown',
	"last_check" timestamp,
	"last_up" timestamp,
	"last_down" timestamp,
	"latitude" numeric(10, 7),
	"longitude" numeric(10, 7),
	"location" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "role" SET DATA TYPE text;--> statement-breakpoint
DO $$ BEGIN
    -- Clean up orphaned records first
    DELETE FROM "router_netwatch" WHERE "router_id" NOT IN (SELECT "id" FROM "routers");
    
    ALTER TABLE "router_netwatch" ADD CONSTRAINT "router_netwatch_router_id_routers_id_fk" FOREIGN KEY ("router_id") REFERENCES "public"."routers"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
    WHEN duplicate_object THEN null;
    WHEN OTHERS THEN
        IF (SQLSTATE = '42P07') THEN null;
        ELSE RAISE;
        END IF;
END $$;