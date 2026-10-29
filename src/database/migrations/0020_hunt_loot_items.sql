CREATE TYPE "public"."hunt_loot_kind" AS ENUM('fragment', 'consumable', 'event');--> statement-breakpoint
CREATE TABLE "hunt_loot_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"kind" "hunt_loot_kind" NOT NULL,
	"name" text NOT NULL,
	"icon_file" text NOT NULL,
	"npc_price_meso" integer,
	"from" text,
	"until" text,
	"sort_order" integer NOT NULL,
	CONSTRAINT "hunt_loot_items_key_unique" UNIQUE("key"),
	CONSTRAINT "hunt_loot_items_npc_price" CHECK (("hunt_loot_items"."kind" = 'consumable') = ("hunt_loot_items"."npc_price_meso" IS NOT NULL) AND ("hunt_loot_items"."npc_price_meso" IS NULL OR "hunt_loot_items"."npc_price_meso" > 0))
);
