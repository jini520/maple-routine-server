-- 새 DB 에서 바꾸는 표 가운데 옛 마이그레이션 0014 · 0031 이 기준 줄을 넣은 것(가계부 아이템 종류 · 지출 형태)은 지우고 새로 만든다.
-- 옮기는 스크립트가 옛 DB 의 줄을 줄 id 그대로 다시 채운다. 나머지 표는 비어 있어 칸을 바꿀 때 줄을 옮기지 않는다.
CREATE TYPE "public"."hunt_loot_type" AS ENUM('fragment', 'consumable', 'event');--> statement-breakpoint
CREATE TYPE "public"."spend_reward_type" AS ENUM('exp', 'sol_erda');--> statement-breakpoint
CREATE TABLE "cashbook_item_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"unit" text,
	"has_tariff" boolean NOT NULL,
	"sort_order" integer NOT NULL,
	CONSTRAINT "cashbook_item_types_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "spend_item_reward_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"reward_type_id" uuid NOT NULL,
	CONSTRAINT "spend_item_reward_types_item_type_unique" UNIQUE("item_id","reward_type_id")
);
--> statement-breakpoint
CREATE TABLE "spend_reward_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" "spend_reward_type" NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer NOT NULL,
	CONSTRAINT "spend_reward_types_key_unique" UNIQUE("key")
);
--> statement-breakpoint
ALTER TABLE "cashbook_item_kinds" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "spend_forms" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "spend_item_forms" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "cashbook_item_kinds" CASCADE;--> statement-breakpoint
DROP TABLE "spend_forms" CASCADE;--> statement-breakpoint
DROP TABLE "spend_item_forms" CASCADE;--> statement-breakpoint
ALTER TABLE "hunt_loot_items" DROP CONSTRAINT "hunt_loot_items_npc_price";--> statement-breakpoint
ALTER TABLE "spend_tiles" DROP CONSTRAINT "spend_tiles_icon_one";--> statement-breakpoint
ALTER TABLE "spend_groups" DROP CONSTRAINT "spend_groups_category_id_cashbook_categories_id_fk";
--> statement-breakpoint
ALTER TABLE "spend_tiles" DROP CONSTRAINT "spend_tiles_icon_map_asset_id_assets_id_fk";
--> statement-breakpoint
ALTER TABLE "hunt_loot_items" ADD COLUMN "type" "hunt_loot_type" NOT NULL;--> statement-breakpoint
ALTER TABLE "hunt_loot_items" ADD COLUMN "valid_from" text;--> statement-breakpoint
ALTER TABLE "hunt_loot_items" ADD COLUMN "valid_until" text;--> statement-breakpoint
ALTER TABLE "spend_groups" ADD COLUMN "cashbook_category_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "spend_groups" ADD COLUMN "is_active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "spend_items" ADD COLUMN "reward_coin_quantity" integer;--> statement-breakpoint
ALTER TABLE "spend_items" ADD COLUMN "valid_from" text;--> statement-breakpoint
ALTER TABLE "spend_items" ADD COLUMN "valid_until" text;--> statement-breakpoint
ALTER TABLE "spend_item_reward_types" ADD CONSTRAINT "spend_item_reward_types_item_id_spend_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."spend_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spend_item_reward_types" ADD CONSTRAINT "spend_item_reward_types_reward_type_id_spend_reward_types_id_fk" FOREIGN KEY ("reward_type_id") REFERENCES "public"."spend_reward_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spend_groups" ADD CONSTRAINT "spend_groups_cashbook_category_id_cashbook_categories_id_fk" FOREIGN KEY ("cashbook_category_id") REFERENCES "public"."cashbook_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hunt_loot_items" DROP COLUMN "kind";--> statement-breakpoint
ALTER TABLE "hunt_loot_items" DROP COLUMN "from";--> statement-breakpoint
ALTER TABLE "hunt_loot_items" DROP COLUMN "until";--> statement-breakpoint
ALTER TABLE "spend_groups" DROP COLUMN "category_id";--> statement-breakpoint
ALTER TABLE "spend_groups" DROP COLUMN "active";--> statement-breakpoint
ALTER TABLE "spend_items" DROP COLUMN "short_name";--> statement-breakpoint
ALTER TABLE "spend_items" DROP COLUMN "reward_coins";--> statement-breakpoint
ALTER TABLE "spend_items" DROP COLUMN "from";--> statement-breakpoint
ALTER TABLE "spend_items" DROP COLUMN "until";--> statement-breakpoint
ALTER TABLE "spend_tiles" DROP COLUMN "icon_map_asset_id";--> statement-breakpoint
ALTER TABLE "hunt_loot_items" ADD CONSTRAINT "hunt_loot_items_npc_price" CHECK (("hunt_loot_items"."type" = 'consumable') = ("hunt_loot_items"."npc_price_meso" IS NOT NULL) AND ("hunt_loot_items"."npc_price_meso" IS NULL OR "hunt_loot_items"."npc_price_meso" > 0));--> statement-breakpoint
DROP TYPE "public"."hunt_loot_kind";--> statement-breakpoint
DROP TYPE "public"."spend_form";