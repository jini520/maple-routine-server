CREATE TYPE "public"."market_reference_source" AS ENUM('today', 'three_day', 'carry');--> statement-breakpoint
CREATE TABLE "market_days" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"day" date NOT NULL,
	"item_id" uuid NOT NULL,
	"ring_level" integer,
	"scope" text NOT NULL,
	"source" "market_reference_source" NOT NULL,
	"ref_meso" bigint NOT NULL,
	"q1_meso" bigint NOT NULL,
	"q3_meso" bigint NOT NULL,
	"fence_low" double precision NOT NULL,
	"fence_high" double precision NOT NULL,
	"voters" integer NOT NULL,
	"fresh_day" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "market_judgements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"day" date NOT NULL,
	"person" text NOT NULL,
	"judged" integer NOT NULL,
	"excluded" integer NOT NULL,
	"dummy" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "market_judgements_day_person_unique" UNIQUE("day","person")
);
--> statement-breakpoint
CREATE TABLE "market_responses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"day" date NOT NULL,
	"key" text NOT NULL,
	"body" text NOT NULL,
	"etag" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "market_responses_day_key_unique" UNIQUE("day","key")
);
--> statement-breakpoint
CREATE TABLE "market_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"day" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "market_runs_day_unique" UNIQUE("day")
);
--> statement-breakpoint
CREATE TABLE "maspi_basket" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"ring_level" integer,
	"scope" text NOT NULL,
	"base_price_meso" double precision NOT NULL,
	"persons" integer NOT NULL,
	"weight" double precision NOT NULL,
	"enters_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "maspi_days" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"day" date NOT NULL,
	"value" double precision NOT NULL,
	"change" double precision,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "maspi_days_day_unique" UNIQUE("day")
);
--> statement-breakpoint
ALTER TABLE "market_days" ADD CONSTRAINT "market_days_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maspi_basket" ADD CONSTRAINT "maspi_basket_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "market_days_market_day_unique" ON "market_days" USING btree ("day","item_id",coalesce("ring_level", 0),"scope");--> statement-breakpoint
CREATE UNIQUE INDEX "maspi_basket_unique" ON "maspi_basket" USING btree ("item_id",coalesce("ring_level", 0),"scope");