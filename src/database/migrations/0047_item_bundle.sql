CREATE TYPE "public"."item_group_type" AS ENUM('equipment', 'accessory', 'consumable', 'etc', 'cash');--> statement-breakpoint
CREATE TABLE "ring_level_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"ring_item_id" uuid NOT NULL,
	"ring_level" smallint NOT NULL,
	CONSTRAINT "ring_level_items_item_id_unique" UNIQUE("item_id"),
	CONSTRAINT "ring_level_items_ring_level_unique" UNIQUE("ring_item_id","ring_level"),
	CONSTRAINT "ring_level_items_level_positive" CHECK ("ring_level_items"."ring_level" >= 1),
	CONSTRAINT "ring_level_items_not_self" CHECK ("ring_level_items"."item_id" <> "ring_level_items"."ring_item_id")
);
--> statement-breakpoint
CREATE TABLE "same_item_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"original_item_id" uuid NOT NULL,
	CONSTRAINT "same_item_links_item_id_unique" UNIQUE("item_id"),
	CONSTRAINT "same_item_links_not_self" CHECK ("same_item_links"."item_id" <> "same_item_links"."original_item_id")
);
--> statement-breakpoint
CREATE TABLE "trade_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "trade_groups_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "world_open_periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"world_id" uuid NOT NULL,
	"valid_from" text NOT NULL,
	"valid_until" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "world_open_periods_world_from_unique" UNIQUE("world_id","valid_from")
);
--> statement-breakpoint
ALTER TABLE "world_periods" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "world_periods" CASCADE;--> statement-breakpoint
ALTER TABLE "item_groups" DROP CONSTRAINT "item_groups_kind_name_unique";--> statement-breakpoint
ALTER TABLE "items" DROP CONSTRAINT "items_level_positive";--> statement-breakpoint
ALTER TABLE "items" DROP CONSTRAINT "items_category_item_groups_key_fk";
--> statement-breakpoint
-- 0041 이 빈 DB 에도 묶음 줄을 넣으므로 종류를 지금 값에서 채운 뒤 NOT NULL 로 건다. 다른 칸은 빈 표에서만 돈다.
ALTER TABLE "item_groups" ADD COLUMN "type" "item_group_type";--> statement-breakpoint
UPDATE "item_groups" SET "type" = "kind"::"item_group_type";--> statement-breakpoint
ALTER TABLE "item_groups" ALTER COLUMN "type" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "group_id" uuid;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "is_valuable" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "required_level" integer;--> statement-breakpoint
ALTER TABLE "worlds" ADD COLUMN "is_challengers" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "worlds" ADD COLUMN "is_event" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "worlds" ADD COLUMN "trade_group_id" uuid;--> statement-breakpoint
ALTER TABLE "ring_level_items" ADD CONSTRAINT "ring_level_items_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ring_level_items" ADD CONSTRAINT "ring_level_items_ring_item_id_items_id_fk" FOREIGN KEY ("ring_item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "same_item_links" ADD CONSTRAINT "same_item_links_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "same_item_links" ADD CONSTRAINT "same_item_links_original_item_id_items_id_fk" FOREIGN KEY ("original_item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "world_open_periods" ADD CONSTRAINT "world_open_periods_world_id_worlds_id_fk" FOREIGN KEY ("world_id") REFERENCES "public"."worlds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_group_id_item_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."item_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worlds" ADD CONSTRAINT "worlds_trade_group_id_trade_groups_id_fk" FOREIGN KEY ("trade_group_id") REFERENCES "public"."trade_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_groups" DROP COLUMN "kind";--> statement-breakpoint
ALTER TABLE "items" DROP COLUMN "category";--> statement-breakpoint
ALTER TABLE "items" DROP COLUMN "valuable";--> statement-breakpoint
ALTER TABLE "items" DROP COLUMN "world_bound";--> statement-breakpoint
ALTER TABLE "items" DROP COLUMN "level";--> statement-breakpoint
ALTER TABLE "worlds" DROP COLUMN "challengers";--> statement-breakpoint
ALTER TABLE "worlds" DROP COLUMN "event";--> statement-breakpoint
ALTER TABLE "worlds" DROP COLUMN "price_group";--> statement-breakpoint
ALTER TABLE "item_groups" ADD CONSTRAINT "item_groups_type_name_unique" UNIQUE("type","name");--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_required_level_positive" CHECK ("items"."required_level" IS NULL OR "items"."required_level" >= 1);