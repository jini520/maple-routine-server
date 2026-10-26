CREATE TYPE "public"."image_crop_kind" AS ENUM('boss_portrait', 'boss_portrait_icon', 'boss_portrait_modal', 'daily_quest_region');--> statement-breakpoint
CREATE TABLE "assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"path" text NOT NULL,
	"sha256" text NOT NULL,
	"size" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assets_path_unique" UNIQUE("path")
);
--> statement-breakpoint
CREATE TABLE "image_crops" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "image_crop_kind" NOT NULL,
	"slug" text NOT NULL,
	"size" text NOT NULL,
	"position" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "image_crops_kind_slug_unique" UNIQUE("kind","slug")
);
