CREATE TABLE "user_routers" (
	"user_id" uuid NOT NULL,
	"router_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_routers_user_id_router_id_pk" PRIMARY KEY("user_id","router_id")
);
--> statement-breakpoint
ALTER TABLE "router_interfaces" ADD COLUMN "tx_rate" bigint DEFAULT 0;--> statement-breakpoint
ALTER TABLE "router_interfaces" ADD COLUMN "rx_rate" bigint DEFAULT 0;--> statement-breakpoint
ALTER TABLE "user_routers" ADD CONSTRAINT "user_routers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_routers" ADD CONSTRAINT "user_routers_router_id_routers_id_fk" FOREIGN KEY ("router_id") REFERENCES "public"."routers"("id") ON DELETE cascade ON UPDATE no action;