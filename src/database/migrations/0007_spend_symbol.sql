CREATE TYPE "public"."spend_category" AS ENUM('content', 'event_bm', 'buff', 'scroll');--> statement-breakpoint
CREATE TYPE "public"."spend_currency" AS ENUM('point', 'meso');--> statement-breakpoint
CREATE TYPE "public"."spend_form" AS ENUM('exp', 'sol_erda');--> statement-breakpoint
CREATE TABLE "spend_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"category" "spend_category" NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer NOT NULL,
	CONSTRAINT "spend_groups_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "spend_item_forms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"form" "spend_form" NOT NULL,
	CONSTRAINT "spend_item_forms_item_form_unique" UNIQUE("item_id","form")
);
--> statement-breakpoint
CREATE TABLE "spend_item_options" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"axis" text NOT NULL,
	"value" text NOT NULL,
	CONSTRAINT "spend_item_options_item_axis_unique" UNIQUE("item_id","axis")
);
--> statement-breakpoint
CREATE TABLE "spend_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"group_id" uuid NOT NULL,
	"tile_id" uuid NOT NULL,
	"name" text NOT NULL,
	"tier" text,
	"currency" "spend_currency" NOT NULL,
	"unit_price" bigint,
	"unit" text NOT NULL,
	"max_quantity" integer,
	"reward_coins" integer,
	"from" text,
	"until" text,
	"sort_order" integer NOT NULL,
	CONSTRAINT "spend_items_key_unique" UNIQUE("key"),
	CONSTRAINT "spend_items_unit_price_nonnegative" CHECK ("spend_items"."unit_price" IS NULL OR "spend_items"."unit_price" >= 0)
);
--> statement-breakpoint
CREATE TABLE "spend_tiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"icon_file" text,
	"icon_map" text,
	CONSTRAINT "spend_tiles_key_unique" UNIQUE("key"),
	CONSTRAINT "spend_tiles_icon_one" CHECK ("spend_tiles"."icon_file" IS NULL OR "spend_tiles"."icon_map" IS NULL)
);
--> statement-breakpoint
CREATE TABLE "symbol_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"max_level" integer NOT NULL,
	"default_from" integer NOT NULL,
	"default_to" integer NOT NULL,
	"sort_order" integer NOT NULL,
	CONSTRAINT "symbol_groups_key_unique" UNIQUE("key"),
	CONSTRAINT "symbol_groups_default_range" CHECK ("symbol_groups"."default_from" < "symbol_groups"."default_to" AND "symbol_groups"."default_to" <= "symbol_groups"."max_level")
);
--> statement-breakpoint
CREATE TABLE "symbol_level_costs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"symbol_id" uuid NOT NULL,
	"level" integer NOT NULL,
	"cost_meso" bigint NOT NULL,
	"from" text,
	"until" text,
	CONSTRAINT "symbol_level_costs_row_unique" UNIQUE NULLS NOT DISTINCT("symbol_id","level","from"),
	CONSTRAINT "symbol_level_costs_level_positive" CHECK ("symbol_level_costs"."level" >= 1)
);
--> statement-breakpoint
CREATE TABLE "symbols" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"group_id" uuid NOT NULL,
	"name" text NOT NULL,
	"required_level" integer NOT NULL,
	"icon_file" text NOT NULL,
	"sort_order" integer NOT NULL,
	CONSTRAINT "symbols_key_unique" UNIQUE("key")
);
--> statement-breakpoint
ALTER TABLE "spend_item_forms" ADD CONSTRAINT "spend_item_forms_item_id_spend_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."spend_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spend_item_options" ADD CONSTRAINT "spend_item_options_item_id_spend_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."spend_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spend_items" ADD CONSTRAINT "spend_items_group_id_spend_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."spend_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spend_items" ADD CONSTRAINT "spend_items_tile_id_spend_tiles_id_fk" FOREIGN KEY ("tile_id") REFERENCES "public"."spend_tiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "symbol_level_costs" ADD CONSTRAINT "symbol_level_costs_symbol_id_symbols_id_fk" FOREIGN KEY ("symbol_id") REFERENCES "public"."symbols"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "symbols" ADD CONSTRAINT "symbols_group_id_symbol_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."symbol_groups"("id") ON DELETE no action ON UPDATE no action;