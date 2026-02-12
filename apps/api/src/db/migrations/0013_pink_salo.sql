CREATE TYPE "public"."olt_status" AS ENUM('online', 'offline', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."olt_type" AS ENUM('hsgq', 'cdata', 'generic');--> statement-breakpoint
CREATE TABLE "olts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"host" text NOT NULL,
	"snmp_port" integer DEFAULT 161 NOT NULL,
	"snmp_community" text DEFAULT 'public' NOT NULL,
	"type" "olt_type" DEFAULT 'generic' NOT NULL,
	"status" "olt_status" DEFAULT 'unknown' NOT NULL,
	"uptime" integer,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
