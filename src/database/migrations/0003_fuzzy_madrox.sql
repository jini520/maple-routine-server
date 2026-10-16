CREATE TYPE "public"."drop_category" AS ENUM('fixed', 'equipment', 'consumable');--> statement-breakpoint
CREATE TABLE "boss_crystal_prices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"boss_difficulty_id" uuid NOT NULL,
	"price_meso" bigint NOT NULL,
	"from" text,
	"until" text,
	CONSTRAINT "boss_crystal_prices_pair_from_unique" UNIQUE NULLS NOT DISTINCT("boss_difficulty_id","from")
);
--> statement-breakpoint
CREATE TABLE "boss_drop_rewards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"boss_difficulty_id" uuid NOT NULL,
	"category" "drop_category" NOT NULL,
	"item_id" uuid NOT NULL,
	"amount" text,
	"from" text,
	"until" text,
	"sort_order" integer NOT NULL,
	CONSTRAINT "boss_drop_rewards_row_unique" UNIQUE NULLS NOT DISTINCT("boss_difficulty_id","category","item_id","from")
);
--> statement-breakpoint
CREATE TABLE "drop_box_contents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"box_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"sort_order" integer NOT NULL,
	CONSTRAINT "drop_box_contents_box_item_unique" UNIQUE("box_id","item_id")
);
--> statement-breakpoint
CREATE TABLE "drop_boxes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"level_min" integer,
	"level_max" integer,
	CONSTRAINT "drop_boxes_item_id_unique" UNIQUE("item_id"),
	CONSTRAINT "drop_boxes_level_pair" CHECK (("drop_boxes"."level_min" IS NULL) = ("drop_boxes"."level_max" IS NULL)),
	CONSTRAINT "drop_boxes_level_order" CHECK ("drop_boxes"."level_min" IS NULL OR "drop_boxes"."level_min" <= "drop_boxes"."level_max")
);
--> statement-breakpoint
CREATE TABLE "drop_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"icon_file" text,
	"valuable" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "drop_items_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "game_data_sections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "game_data_sections_key_unique" UNIQUE("key")
);
--> statement-breakpoint
ALTER TABLE "boss_difficulties" ADD COLUMN "max_party_size" integer;--> statement-breakpoint
ALTER TABLE "boss_crystal_prices" ADD CONSTRAINT "boss_crystal_prices_boss_difficulty_id_boss_difficulties_id_fk" FOREIGN KEY ("boss_difficulty_id") REFERENCES "public"."boss_difficulties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boss_drop_rewards" ADD CONSTRAINT "boss_drop_rewards_boss_difficulty_id_boss_difficulties_id_fk" FOREIGN KEY ("boss_difficulty_id") REFERENCES "public"."boss_difficulties"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "boss_drop_rewards" ADD CONSTRAINT "boss_drop_rewards_item_id_drop_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."drop_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drop_box_contents" ADD CONSTRAINT "drop_box_contents_box_id_drop_boxes_id_fk" FOREIGN KEY ("box_id") REFERENCES "public"."drop_boxes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drop_box_contents" ADD CONSTRAINT "drop_box_contents_item_id_drop_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."drop_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drop_boxes" ADD CONSTRAINT "drop_boxes_item_id_drop_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."drop_items"("id") ON DELETE no action ON UPDATE no action;