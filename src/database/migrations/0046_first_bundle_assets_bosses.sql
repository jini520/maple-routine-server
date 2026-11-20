CREATE TYPE "public"."asset_category" AS ENUM('skill', 'item', 'item_ring', 'boss', 'map', 'map_icon', 'world', 'mvp', 'force', 'character', 'drop_effect_screen', 'drop_effect_pre', 'drop_effect_loop', 'drop_effect_end');--> statement-breakpoint
ALTER TABLE "assets" DROP CONSTRAINT "assets_path_unique";--> statement-breakpoint
ALTER TABLE "bosses" DROP COLUMN "cycle";--> statement-breakpoint
ALTER TABLE "boss_clears" ALTER COLUMN "cycle" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "public"."boss_cycle";--> statement-breakpoint
CREATE TYPE "public"."boss_cycle" AS ENUM('weekly', 'monthly');--> statement-breakpoint
ALTER TABLE "boss_clears" ALTER COLUMN "cycle" SET DATA TYPE "public"."boss_cycle" USING "cycle"::"public"."boss_cycle";--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "category" "asset_category" NOT NULL;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "file_name" text NOT NULL;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "extension" text NOT NULL;--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "size_bytes" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "boss_difficulties" ADD COLUMN "cycle" "boss_cycle" NOT NULL;--> statement-breakpoint
ALTER TABLE "boss_difficulties" ADD COLUMN "valid_from" text;--> statement-breakpoint
ALTER TABLE "boss_difficulties" ADD COLUMN "valid_until" text;--> statement-breakpoint
ALTER TABLE "bosses" ADD COLUMN "short_name" text NOT NULL;--> statement-breakpoint
ALTER TABLE "bosses" ADD COLUMN "is_season_boss" boolean NOT NULL;--> statement-breakpoint
ALTER TABLE "bosses" ADD COLUMN "valid_from" text;--> statement-breakpoint
ALTER TABLE "bosses" ADD COLUMN "valid_until" text;--> statement-breakpoint
ALTER TABLE "assets" DROP COLUMN "path";--> statement-breakpoint
ALTER TABLE "assets" DROP COLUMN "size";--> statement-breakpoint
ALTER TABLE "boss_difficulties" DROP COLUMN "from";--> statement-breakpoint
ALTER TABLE "boss_difficulties" DROP COLUMN "until";--> statement-breakpoint
ALTER TABLE "bosses" DROP COLUMN "alias";--> statement-breakpoint
ALTER TABLE "bosses" DROP COLUMN "from";--> statement-breakpoint
ALTER TABLE "bosses" DROP COLUMN "until";--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_category_file_name_extension_unique" UNIQUE("category","file_name","extension");